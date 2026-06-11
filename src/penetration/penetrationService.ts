import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

import { rolePackPath } from '../config';

import { getEffectiveConfig } from '../runtimeConfig';

import type { KernelClient } from '../kernelClient';

import { ensureWorkspaceWriteAuthorized, maybePromptGitignore } from './authorization';

import { mergePenetrationConfig, type PenetrationConfig } from './config';

import {

  pathMatchesAllowedGlobs,

  relativePosixFromWorkspace,

  resolveDiaryPath,

  resolvePenetrationDir,

} from './paths';

import {

  readPenetrationTemplates,

  rolePackPenetrationOverrides,

} from './rolePackPenetration';

import { formatDiaryEntry, summarizeDiaryForMemory, type DiaryTurnContent } from './templates';

import {

  assertLetterPathAllowed,

  formatLetterMarkdown,

  resolveLetterPath,

} from './letterWriter';

import { appendUtf8, readUtf8IfExists, writeUtf8 } from './workspaceWriter';

import { showTerminalLine } from './terminalDisplay';



const TURN_COUNTER_KEY = 'oclive.penetration.turnCounters';

const DIARY_PROMPT_KEY = 'oclive.penetration.diaryPromptTurn';



type TurnCounters = Record<string, number>;



export interface AppendDiaryResult {

  ok: boolean;

  message: string;

  filePath?: string;

}



export interface WriteLetterResult {

  ok: boolean;

  message: string;

  filePath?: string;

}



export class PenetrationService {

  constructor(

    private readonly context: vscode.ExtensionContext,

    private readonly kernel: KernelClient,

  ) {}



  getConfig(): PenetrationConfig {

    const eff = getEffectiveConfig();

    const packDir = eff.rolesDir ? rolePackPath(eff) : '';

    const templates = packDir ? readPenetrationTemplates(packDir) : {};

    return mergePenetrationConfig(rolePackPenetrationOverrides(templates));

  }



  private workspaceFolder(): vscode.WorkspaceFolder | undefined {

    return vscode.workspace.workspaceFolders?.[0];

  }



  private counterKey(folder: vscode.WorkspaceFolder, roleId: string): string {

    return `${folder.uri.toString()}::${roleId}`;

  }



  private async getTurnCount(folder: vscode.WorkspaceFolder, roleId: string): Promise<number> {

    const all = this.context.globalState.get<TurnCounters>(TURN_COUNTER_KEY, {});

    return all[this.counterKey(folder, roleId)] ?? 0;

  }



  private async bumpTurnCount(folder: vscode.WorkspaceFolder, roleId: string): Promise<number> {

    const all = { ...this.context.globalState.get<TurnCounters>(TURN_COUNTER_KEY, {}) };

    const key = this.counterKey(folder, roleId);

    const next = (all[key] ?? 0) + 1;

    all[key] = next;

    await this.context.globalState.update(TURN_COUNTER_KEY, all);

    return next;

  }



  /** Count `## ISO` diary sections for status display. */

  countDiarySections(diaryPath: string): number {

    if (!fs.existsSync(diaryPath)) {

      return 0;

    }

    try {

      const raw = fs.readFileSync(diaryPath, 'utf8');

      return (raw.match(/^## /gm) ?? []).length;

    } catch {

      return 0;

    }

  }



  async revealOcliveFolder(): Promise<{ ok: boolean; message: string }> {

    const folder = this.workspaceFolder();

    if (!folder) {

      return { ok: false, message: '请先打开一个工作区文件夹' };

    }

    const eff = getEffectiveConfig();

    const dir = resolvePenetrationDir(folder.uri.fsPath, eff.roleId);

    const uri = vscode.Uri.file(dir);

    if (!fs.existsSync(dir)) {

      await vscode.workspace.fs.createDirectory(uri);

    }

    await vscode.commands.executeCommand('revealInExplorer', uri);

    return { ok: true, message: `已定位 ${dir}` };

  }



  async appendDiaryFromLastTurn(

    userText: string,

    assistantText: string,

    roleName?: string,

  ): Promise<AppendDiaryResult> {

    const config = this.getConfig();

    if (!config.enabled) {

      return { ok: false, message: '渗透功能已在设置中关闭' };

    }

    const folder = this.workspaceFolder();

    if (!folder) {

      return { ok: false, message: '请先打开一个工作区文件夹' };

    }

    if (!(await ensureWorkspaceWriteAuthorized(this.context, folder))) {

      return { ok: false, message: '未授权写入此工作区' };

    }



    const eff = getEffectiveConfig();

    const roleId = eff.roleId;

    const packDir = rolePackPath(eff);

    const packTemplates = readPenetrationTemplates(packDir);

    if (packTemplates.enabled === false) {

      return { ok: false, message: '当前角色包已禁用渗透模板' };

    }



    const diaryTemplate = packTemplates.diaryPath ?? config.diaryPathTemplate;

    let diaryPath: string;

    try {

      diaryPath = resolveDiaryPath(folder.uri.fsPath, roleId, diaryTemplate);

    } catch (e) {

      const msg = e instanceof Error ? e.message : String(e);

      return { ok: false, message: msg };

    }



    const rel = relativePosixFromWorkspace(folder.uri.fsPath, diaryPath);

    if (!pathMatchesAllowedGlobs(rel, config.allowedGlobs)) {

      return { ok: false, message: `路径不在白名单内：${rel}` };

    }



    const entry = formatDiaryEntry({

      userText,

      assistantText,

      roleName,

      headerLine: packTemplates.diaryHeader,

    });



    try {

      await appendUtf8(diaryPath, entry);

    } catch (e) {

      const msg = e instanceof Error ? e.message : String(e);

      return { ok: false, message: `写入失败：${msg}` };

    }



    await maybePromptGitignore(this.context, folder);



    if (config.previewAfterWrite) {

      const doc = await vscode.workspace.openTextDocument(diaryPath);

      await vscode.window.showTextDocument(doc, { preview: true, preserveFocus: true });

    }



    if (config.terminalEnabled && assistantText.trim()) {

      const snippet = assistantText.trim().split(/\r?\n/)[0].slice(0, 120);

      showTerminalLine(snippet, roleName);

    }



    return { ok: true, message: `已记入日记：${rel}`, filePath: diaryPath };

  }



  async writeLetterFromDraft(

    body: string,

    roleName?: string,

    slug = 'letter',

  ): Promise<WriteLetterResult> {

    const config = this.getConfig();

    if (!config.enabled) {

      return { ok: false, message: '渗透功能已在设置中关闭' };

    }

    const folder = this.workspaceFolder();

    if (!folder) {

      return { ok: false, message: '请先打开一个工作区文件夹' };

    }

    if (!body.trim()) {

      return { ok: false, message: '信件正文不能为空' };

    }

    if (!(await ensureWorkspaceWriteAuthorized(this.context, folder))) {

      return { ok: false, message: '未授权写入此工作区' };

    }



    const eff = getEffectiveConfig();

    const roleId = eff.roleId;

    const packDir = rolePackPath(eff);

    const packTemplates = readPenetrationTemplates(packDir);

    if (packTemplates.enabled === false) {

      return { ok: false, message: '当前角色包已禁用渗透模板' };

    }



    const pathTemplate =

      packTemplates.letterPathTemplate ?? '.oclive/{roleId}/letters/{slug}.md';

    let letterPath: string;

    try {

      letterPath = resolveLetterPath(folder.uri.fsPath, roleId, slug, pathTemplate);

    } catch (e) {

      const msg = e instanceof Error ? e.message : String(e);

      return { ok: false, message: msg };

    }



    let rel: string;

    try {

      rel = assertLetterPathAllowed(folder.uri.fsPath, letterPath, config.allowedGlobs);

    } catch (e) {

      const msg = e instanceof Error ? e.message : String(e);

      return { ok: false, message: msg };

    }



    const markdown = formatLetterMarkdown({

      slug,

      body,

      roleName,

      template: packTemplates.letterTemplate,

    });



    const preview = markdown.slice(0, 400) + (markdown.length > 400 ? '…' : '');

    const confirm = await vscode.window.showInformationMessage(

      `预览信件（${rel}）\n\n${preview}`,

      { modal: true },

      '写入',

      '取消',

    );

    if (confirm !== '写入') {

      return { ok: false, message: '已取消写入' };

    }



    try {

      await fs.promises.mkdir(path.dirname(letterPath), { recursive: true });

      await writeUtf8(letterPath, markdown);

    } catch (e) {

      const msg = e instanceof Error ? e.message : String(e);

      return { ok: false, message: `写入失败：${msg}` };

    }



    await maybePromptGitignore(this.context, folder);

    if (config.previewAfterWrite) {

      const doc = await vscode.workspace.openTextDocument(letterPath);

      await vscode.window.showTextDocument(doc, { preview: true, preserveFocus: true });

    }



    return { ok: true, message: `已写信：${rel}`, filePath: letterPath };

  }



  /** After a successful chat turn: optional auto-diary or prompt every N turns. */

  async maybeAutoDiaryAfterTurn(

    userText: string,

    assistantText: string,

    roleName?: string,

  ): Promise<void> {

    const config = this.getConfig();

    const n = config.autoDiaryEveryNTurns;

    if (!config.enabled || n <= 0) {

      return;

    }

    const folder = this.workspaceFolder();

    if (!folder) {

      return;

    }

    const eff = getEffectiveConfig();

    const count = await this.bumpTurnCount(folder, eff.roleId);

    if (count % n !== 0) {

      return;

    }



    const promptKey = `${this.counterKey(folder, eff.roleId)}::${count}`;

    const prompted = this.context.globalState.get<string>(DIARY_PROMPT_KEY, '');

    if (prompted === promptKey) {

      return;

    }



    const label = roleName?.trim() ? `${roleName}想` : '要把';

    const choice = await vscode.window.showInformationMessage(

      `${label}把这轮记入日记吗？（每 ${n} 轮提醒）`,

      '记入日记',

      '跳过',

    );

    await this.context.globalState.update(DIARY_PROMPT_KEY, promptKey);

    if (choice !== '记入日记') {

      return;

    }

    const result = await this.appendDiaryFromLastTurn(userText, assistantText, roleName);

    if (result.ok) {

      void vscode.window.showInformationMessage(result.message);

    }

  }



  async syncTodayDiaryToMemory(): Promise<{ ok: boolean; message: string }> {

    const config = this.getConfig();

    if (!config.memorySync.enabled) {

      return { ok: false, message: '请先在设置 → 渗透中开启「日记摘要提交记忆」' };

    }

    const folder = this.workspaceFolder();

    if (!folder) {

      return { ok: false, message: '请先打开工作区' };

    }

    const eff = getEffectiveConfig();

    const packDir = rolePackPath(eff);

    const packTemplates = readPenetrationTemplates(packDir);

    const diaryTemplate = packTemplates.diaryPath ?? config.diaryPathTemplate;

    let diaryPath: string;

    try {

      diaryPath = resolveDiaryPath(folder.uri.fsPath, eff.roleId, diaryTemplate);

    } catch (e) {

      const msg = e instanceof Error ? e.message : String(e);

      return { ok: false, message: msg };

    }

    if (!fs.existsSync(diaryPath)) {

      return { ok: false, message: '今日尚无日记文件' };

    }

    const raw = await readUtf8IfExists(diaryPath);

    if (!raw?.trim()) {

      return { ok: false, message: '日记文件为空' };

    }

    const summary = summarizeDiaryForMemory(raw);

    const result = await this.kernel.bridgeDispatch(

      'update_memory',

      {

        role_id: eff.roleId,

        content: summary,

        importance: config.memorySync.importance,

      },

      eff,

    );

    if (!result.ok) {

      return { ok: false, message: result.error.message };

    }

    return { ok: true, message: '已将日记摘要提交至长期记忆' };

  }

}



export type { DiaryTurnContent };


