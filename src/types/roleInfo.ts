/** Aligns with `oclive_kernel_types::models::dto::RoleInfo` (HTTP GET /role_info). */
export interface RoleInfo {
  role_id: string;
  role_name: string;
  version: string;
  author: string;
  description: string;
  current_favorability: number;
  current_emotion: string;
  effective_ollama_model: string;
  identity_binding: 'global' | 'per_scene';
  reply_post_processor_enabled?: boolean;
  reply_post_processor_backend?: string;
  reply_post_processor_profile?: string | null;
  plugin_backends_effective?: {
    llm?: string;
    memory?: string;
    emotion?: string;
    agent?: string;
    env?: string;
    scene?: string;
  };
  scenes?: string[];
  current_scene?: string | null;
  user_presence_scene?: string | null;
}
