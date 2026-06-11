import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { apiBase, type OcliveConfig } from './config';
import { getSharedAppDataHint, type KernelClient } from './kernelClient';
import { parseKernelErrorResponse } from './kernelError';

export interface McpServerEntry {
  id: string;
  transport: 'http' | 'stdio';
  url?: string;
  command?: string;
  tools?: string[];
}

export interface McpToolEntry {
  name: string;
  description?: string;
  input_schema?: unknown;
}

export interface HighRiskGrantsSnapshot {
  'mcp:http'?: string[];
  'mcp:stdio'?: string[];
  'process:spawn'?: string[];
  'network:*'?: string[];
}

const MCP_OUTPUT = vscode.window.createOutputChannel('OCLive MCP');

export function getMcpOutputChannel(): vscode.OutputChannel {
  return MCP_OUTPUT;
}

/** Read `{app_data}/mcp-servers/*.json` (same shape as desktop `mcp_client.rs`). */
export function listMcpServersFromDisk(): McpServerEntry[] {
  const dir = path.join(getSharedAppDataHint(), 'mcp-servers');
  if (!fs.existsSync(dir)) {
    return [];
  }
  const out: McpServerEntry[] = [];
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith('.json')) {
      continue;
    }
    try {
      const raw = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8')) as Record<string, unknown>;
      const id = (typeof raw.id === 'string' ? raw.id : name.replace(/\.json$/, '')).trim();
      const transport = raw.transport === 'stdio' ? 'stdio' : 'http';
      const tools = Array.isArray(raw.tools)
        ? raw.tools.filter((t): t is string => typeof t === 'string')
        : undefined;
      out.push({
        id,
        transport,
        url: typeof raw.url === 'string' ? raw.url : undefined,
        command: typeof raw.command === 'string' ? raw.command : undefined,
        tools,
      });
    } catch {
      /* skip malformed */
    }
  }
  return out;
}

export async function listHighRiskGrants(
  kernel: KernelClient,
  config: OcliveConfig,
): Promise<HighRiskGrantsSnapshot> {
  await kernel.ensureReady(config);
  try {
    const res = await fetch(`${apiBase(config)}/high_risk/grants`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      return {};
    }
    return (await res.json()) as HighRiskGrantsSnapshot;
  } catch {
    return {};
  }
}

export function isMcpServerGranted(
  grants: HighRiskGrantsSnapshot,
  serverId: string,
  transport: 'http' | 'stdio',
): boolean {
  if (transport === 'stdio') {
    return (grants['mcp:stdio'] ?? []).includes(serverId);
  }
  return (grants['mcp:http'] ?? []).includes(serverId);
}

export async function grantMcpCapability(
  kernel: KernelClient,
  config: OcliveConfig,
  serverId: string,
  transport: 'http' | 'stdio',
): Promise<{ ok: boolean; message: string }> {
  await kernel.ensureReady(config);
  const kind = transport === 'stdio' ? 'mcp:stdio' : 'mcp:http';
  try {
    const res = await fetch(`${apiBase(config)}/high_risk/grant`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind, id: serverId }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      const err = await parseKernelErrorResponse(res);
      return { ok: false, message: err.message };
    }
    return { ok: true, message: `已授予 ${serverId} · ${kind}` };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, message: msg };
  }
}

export async function listMcpServersViaHttp(
  kernel: KernelClient,
  config: OcliveConfig,
): Promise<McpServerEntry[]> {
  await kernel.ensureReady(config);
  try {
    const res = await fetch(`${apiBase(config)}/mcp/servers`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      return listMcpServersFromDisk();
    }
    const json = (await res.json()) as McpServerEntry[];
    return Array.isArray(json) ? json : listMcpServersFromDisk();
  } catch {
    return listMcpServersFromDisk();
  }
}

export async function listMcpToolsViaHttp(
  kernel: KernelClient,
  config: OcliveConfig,
  serverId: string,
): Promise<McpToolEntry[]> {
  await kernel.ensureReady(config);
  const params = new URLSearchParams({ server_id: serverId });
  const res = await fetch(`${apiBase(config)}/mcp/tools?${params.toString()}`, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    const err = await parseKernelErrorResponse(res);
    throw new Error(err.message);
  }
  const json = (await res.json()) as McpToolEntry[];
  return Array.isArray(json) ? json : [];
}

export async function callMcpToolViaHttp(
  kernel: KernelClient,
  config: OcliveConfig,
  serverId: string,
  toolName: string,
  params: unknown = {},
): Promise<{ ok: boolean; message: string; result?: unknown }> {
  await kernel.ensureReady(config);
  try {
    const res = await fetch(`${apiBase(config)}/mcp/call`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ server_id: serverId, tool_name: toolName, params }),
      signal: AbortSignal.timeout(60000),
    });
    if (!res.ok) {
      const err = await parseKernelErrorResponse(res);
      return { ok: false, message: err.message };
    }
    const result = await res.json();
    MCP_OUTPUT.appendLine(`[${serverId}] ${toolName}`);
    MCP_OUTPUT.appendLine(JSON.stringify(result, null, 2));
    MCP_OUTPUT.show(true);
    return { ok: true, message: '调用完成（见 Output · OCLive MCP）', result };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, message: msg };
  }
}

/** QuickPick: server → tool → call (agent profile only). */
export async function runMcpToolQuickPick(
  kernel: KernelClient,
  config: OcliveConfig,
): Promise<void> {
  const servers = await listMcpServersViaHttp(kernel, config);
  if (!servers.length) {
    void vscode.window.showInformationMessage(
      `未找到 MCP 配置。请在 ${getSharedAppDataHint()}\\mcp-servers\\ 添加 *.json`,
    );
    return;
  }
  const grants = await listHighRiskGrants(kernel, config);
  const serverPick = await vscode.window.showQuickPick(
    servers.map((s) => {
      const granted = isMcpServerGranted(grants, s.id, s.transport);
      return {
        label: s.id,
        description: `${s.transport}${granted ? ' · 已授权' : ' · 未授权'}`,
        server: s,
      };
    }),
    { placeHolder: '选择 MCP Server' },
  );
  if (!serverPick) {
    return;
  }
  const server = serverPick.server;
  if (!isMcpServerGranted(grants, server.id, server.transport)) {
    const grant = await grantMcpCapability(kernel, config, server.id, server.transport);
    if (!grant.ok) {
      void vscode.window.showErrorMessage(grant.message);
      return;
    }
    void vscode.window.showInformationMessage(grant.message);
  }
  let tools: McpToolEntry[];
  try {
    tools = await listMcpToolsViaHttp(kernel, config, server.id);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    void vscode.window.showErrorMessage(msg);
    return;
  }
  if (!tools.length) {
    void vscode.window.showWarningMessage(`${server.id} 无可用工具（或未授权 transport）`);
    return;
  }
  const toolPick = await vscode.window.showQuickPick(
    tools.map((t) => ({ label: t.name, description: t.description, tool: t.name })),
    { placeHolder: '选择 MCP Tool' },
  );
  if (!toolPick) {
    return;
  }
  const result = await callMcpToolViaHttp(kernel, config, server.id, toolPick.tool, {});
  if (result.ok) {
    void vscode.window.showInformationMessage(result.message);
  } else {
    void vscode.window.showErrorMessage(result.message);
  }
}

/** List servers + grant only (legacy command). */
export async function runMcpServerGrantQuickPick(
  kernel: KernelClient,
  config: OcliveConfig,
): Promise<void> {
  const servers = listMcpServersFromDisk();
  if (!servers.length) {
    void vscode.window.showInformationMessage(
      `未找到 MCP 配置。请在 ${getSharedAppDataHint()}\\mcp-servers\\ 添加 *.json`,
    );
    return;
  }
  const grants = await listHighRiskGrants(kernel, config);
  const lines = servers.map((s) => {
    const granted = isMcpServerGranted(grants, s.id, s.transport);
    return `${s.id} (${s.transport})${granted ? ' ✓已授权' : ''}`;
  });
  const pick = await vscode.window.showQuickPick(lines, { placeHolder: 'MCP Server（VS-4 高级）' });
  if (!pick) {
    return;
  }
  const idx = lines.indexOf(pick);
  const server = servers[idx];
  const result = await grantMcpCapability(kernel, config, server.id, server.transport);
  if (result.ok) {
    void vscode.window.showInformationMessage(result.message);
  } else {
    void vscode.window.showErrorMessage(result.message);
  }
}
