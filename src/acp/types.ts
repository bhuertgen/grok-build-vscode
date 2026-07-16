/**
 * Agent Client Protocol (ACP) v1 types used by Grok Build for VS Code.
 * Based on https://agentclientprotocol.com/protocol/v1/schema
 */

export const ACP_PROTOCOL_VERSION = 1;

// ─── JSON-RPC ───────────────────────────────────────────────────────────────

export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: number | string;
  method: string;
  params?: unknown;
}

export interface JsonRpcNotification {
  jsonrpc: '2.0';
  method: string;
  params?: unknown;
}

export interface JsonRpcSuccess {
  jsonrpc: '2.0';
  id: number | string;
  result: unknown;
}

export interface JsonRpcError {
  jsonrpc: '2.0';
  id: number | string | null;
  error: {
    code: number;
    message: string;
    data?: unknown;
  };
}

export type JsonRpcMessage =
  | JsonRpcRequest
  | JsonRpcNotification
  | JsonRpcSuccess
  | JsonRpcError;

// ─── Content ────────────────────────────────────────────────────────────────

export type ContentBlock =
  | TextContent
  | ImageContent
  | AudioContent
  | ResourceContent
  | ResourceLinkContent;

export interface TextContent {
  type: 'text';
  text: string;
  annotations?: Annotations;
  _meta?: Record<string, unknown>;
}

export interface ImageContent {
  type: 'image';
  data: string;
  mimeType: string;
  uri?: string;
  annotations?: Annotations;
  _meta?: Record<string, unknown>;
}

export interface AudioContent {
  type: 'audio';
  data: string;
  mimeType: string;
  annotations?: Annotations;
  _meta?: Record<string, unknown>;
}

export interface ResourceContent {
  type: 'resource';
  resource: {
    uri: string;
    mimeType?: string;
    text?: string;
    blob?: string;
  };
  annotations?: Annotations;
  _meta?: Record<string, unknown>;
}

export interface ResourceLinkContent {
  type: 'resource_link';
  uri: string;
  name?: string;
  mimeType?: string;
  description?: string;
  size?: number;
  annotations?: Annotations;
  _meta?: Record<string, unknown>;
}

export interface Annotations {
  audience?: Array<'user' | 'assistant'>;
  lastModified?: string;
  priority?: number;
}

// ─── Initialize ─────────────────────────────────────────────────────────────

export interface Implementation {
  name: string;
  title?: string;
  version: string;
}

export interface ClientCapabilities {
  fs?: {
    readTextFile?: boolean;
    writeTextFile?: boolean;
  };
  terminal?: boolean;
  session?: {
    configOptions?: {
      boolean?: Record<string, unknown>;
    };
  };
  _meta?: Record<string, unknown>;
}

export interface AgentCapabilities {
  loadSession?: boolean;
  promptCapabilities?: {
    image?: boolean;
    audio?: boolean;
    embeddedContext?: boolean;
  };
  mcpCapabilities?: {
    http?: boolean;
    sse?: boolean;
  };
  sessionCapabilities?: {
    list?: Record<string, unknown>;
    delete?: Record<string, unknown>;
    close?: Record<string, unknown>;
    resume?: Record<string, unknown>;
    additionalDirectories?: Record<string, unknown>;
  };
  auth?: {
    logout?: Record<string, unknown>;
  };
  _meta?: Record<string, unknown>;
}

export interface AuthMethod {
  id: string;
  name: string;
  description?: string;
  type?: string;
}

export interface InitializeRequest {
  protocolVersion: number;
  clientCapabilities?: ClientCapabilities;
  clientInfo?: Implementation;
}

export interface InitializeResponse {
  protocolVersion: number;
  agentCapabilities?: AgentCapabilities;
  agentInfo?: Implementation;
  authMethods?: AuthMethod[];
}

// ─── Session ────────────────────────────────────────────────────────────────

export type SessionId = string;
export type SessionModeId = string;
export type ToolCallId = string;
export type TerminalId = string;

export interface McpServerStdio {
  name: string;
  command: string;
  args: string[];
  env?: Array<{ name: string; value: string }>;
}

export interface McpServerHttp {
  type: 'http';
  name: string;
  url: string;
  headers: Array<{ name: string; value: string }>;
}

export interface McpServerSse {
  type: 'sse';
  name: string;
  url: string;
  headers: Array<{ name: string; value: string }>;
}

export type McpServer = McpServerStdio | McpServerHttp | McpServerSse;

export interface SessionMode {
  id: SessionModeId;
  name: string;
  description?: string;
}

export interface SessionModeState {
  currentModeId: SessionModeId;
  availableModes: SessionMode[];
}

export interface SessionConfigOption {
  id: string;
  name: string;
  description?: string;
  category?: string;
  type?: 'select' | 'boolean' | string;
  currentValue?: string | boolean;
  options?: Array<{ value: string; name: string; description?: string }>;
}

export interface NewSessionRequest {
  cwd: string;
  mcpServers: McpServer[];
  additionalDirectories?: string[];
}

export interface NewSessionResponse {
  sessionId: SessionId;
  modes?: SessionModeState | null;
  configOptions?: SessionConfigOption[] | null;
}

export interface LoadSessionRequest {
  sessionId: SessionId;
  cwd: string;
  mcpServers: McpServer[];
  additionalDirectories?: string[];
}

export interface LoadSessionResponse {
  modes?: SessionModeState | null;
  configOptions?: SessionConfigOption[] | null;
}

export interface ResumeSessionRequest {
  sessionId: SessionId;
  cwd: string;
  mcpServers?: McpServer[];
  additionalDirectories?: string[];
}

export interface PromptRequest {
  sessionId: SessionId;
  prompt: ContentBlock[];
}

export type StopReason =
  | 'end_turn'
  | 'max_tokens'
  | 'max_turn_requests'
  | 'refusal'
  | 'cancelled';

export interface PromptResponse {
  stopReason: StopReason;
}

export interface CancelNotification {
  sessionId: SessionId;
}

export interface SetSessionModeRequest {
  sessionId: SessionId;
  modeId: SessionModeId;
}

export interface SetSessionConfigOptionRequest {
  sessionId: SessionId;
  configId: string;
  value?: string;
  type?: string;
}

// ─── Session updates (agent → client) ───────────────────────────────────────

export type ToolCallStatus =
  | 'pending'
  | 'in_progress'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type ToolKind =
  | 'read'
  | 'edit'
  | 'delete'
  | 'move'
  | 'search'
  | 'execute'
  | 'think'
  | 'fetch'
  | 'other';

export interface ToolCallContentDiff {
  type: 'diff';
  path: string;
  oldText?: string | null;
  newText: string;
}

export interface ToolCallContentText {
  type: 'content';
  content: ContentBlock;
}

export interface ToolCallContentTerminal {
  type: 'terminal';
  terminalId: TerminalId;
}

export type ToolCallContent =
  | ToolCallContentDiff
  | ToolCallContentText
  | ToolCallContentTerminal;

export interface ToolCallUpdate {
  toolCallId: ToolCallId;
  title?: string;
  kind?: ToolKind;
  status?: ToolCallStatus;
  content?: ToolCallContent[];
  locations?: Array<{ path: string; line?: number }>;
  rawInput?: unknown;
  rawOutput?: unknown;
  _meta?: Record<string, unknown>;
}

export interface PlanEntry {
  content: string;
  priority?: 'high' | 'medium' | 'low';
  status?: 'pending' | 'in_progress' | 'completed';
}

export type SessionUpdate =
  | {
      sessionUpdate: 'agent_message_chunk';
      messageId?: string;
      content: ContentBlock;
    }
  | {
      sessionUpdate: 'user_message_chunk';
      messageId?: string;
      content: ContentBlock;
    }
  | {
      sessionUpdate: 'agent_thought_chunk' | 'thought_message_chunk';
      messageId?: string;
      content: ContentBlock;
    }
  | {
      sessionUpdate: 'tool_call';
      toolCallId: ToolCallId;
      title?: string;
      kind?: ToolKind;
      status?: ToolCallStatus;
      content?: ToolCallContent[];
      locations?: Array<{ path: string; line?: number }>;
      rawInput?: unknown;
    }
  | ({
      sessionUpdate: 'tool_call_update';
    } & ToolCallUpdate)
  | {
      sessionUpdate: 'plan';
      entries: PlanEntry[];
    }
  | {
      sessionUpdate: 'available_commands_update' | 'available_commands';
      availableCommands: AvailableCommand[];
    }
  | {
      sessionUpdate: 'current_mode_update' | 'mode_change';
      currentModeId: SessionModeId;
    }
  | {
      sessionUpdate: 'usage_update';
      used: number;
      size: number;
      cost?: { amount: number; currency: string };
    }
  | {
      sessionUpdate: 'config_option_update';
      configOptions: SessionConfigOption[];
    }
  | {
      sessionUpdate: 'session_info_update';
      title?: string;
      updatedAt?: string;
    }
  | {
      sessionUpdate: string;
      [key: string]: unknown;
    };

export interface AvailableCommand {
  name: string;
  description: string;
  input?: { hint?: string } | null;
}

export interface SessionNotification {
  sessionId: SessionId;
  update: SessionUpdate;
}

// ─── Permissions ────────────────────────────────────────────────────────────

export interface PermissionOption {
  optionId: string;
  name: string;
  kind: 'allow_once' | 'allow_always' | 'reject_once' | 'reject_always' | string;
}

export interface RequestPermissionRequest {
  sessionId: SessionId;
  toolCall: ToolCallUpdate;
  options: PermissionOption[];
}

export type RequestPermissionOutcome =
  | { outcome: 'cancelled' }
  | { outcome: 'selected'; optionId: string };

export interface RequestPermissionResponse {
  outcome: RequestPermissionOutcome;
}

// ─── File system ────────────────────────────────────────────────────────────

export interface ReadTextFileRequest {
  sessionId: SessionId;
  path: string;
  line?: number | null;
  limit?: number | null;
}

export interface ReadTextFileResponse {
  content: string;
}

export interface WriteTextFileRequest {
  sessionId: SessionId;
  path: string;
  content: string;
}

// ─── Terminal ───────────────────────────────────────────────────────────────

export interface CreateTerminalRequest {
  sessionId: SessionId;
  command: string;
  args?: string[];
  cwd?: string | null;
  env?: Array<{ name: string; value: string }>;
  outputByteLimit?: number | null;
}

export interface CreateTerminalResponse {
  terminalId: TerminalId;
}

export interface TerminalOutputRequest {
  sessionId: SessionId;
  terminalId: TerminalId;
}

export interface TerminalExitStatus {
  exitCode?: number | null;
  signal?: string | null;
}

export interface TerminalOutputResponse {
  output: string;
  truncated: boolean;
  exitStatus?: TerminalExitStatus | null;
}

export interface WaitForTerminalExitRequest {
  sessionId: SessionId;
  terminalId: TerminalId;
}

export interface WaitForTerminalExitResponse {
  exitCode?: number | null;
  signal?: string | null;
}

export interface KillTerminalRequest {
  sessionId: SessionId;
  terminalId: TerminalId;
}

export interface ReleaseTerminalRequest {
  sessionId: SessionId;
  terminalId: TerminalId;
}

// ─── UI-facing chat model ───────────────────────────────────────────────────

export type ChatRole = 'user' | 'agent' | 'system' | 'thought';

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  timestamp: number;
  streaming?: boolean;
  images?: Array<{ mimeType: string; dataUrl: string }>;
  /** Visible @-context refs attached when this message was sent */
  attachments?: Array<{
    kind: string;
    label: string;
    path?: string;
  }>;
}

export interface ChatToolCall {
  id: ToolCallId;
  title: string;
  kind: ToolKind;
  status: ToolCallStatus;
  content: ToolCallContent[];
  locations?: Array<{ path: string; line?: number }>;
  rawInput?: unknown;
  startedAt: number;
  finishedAt?: number;
}

export interface ChatPlan {
  entries: PlanEntry[];
}

export interface UsageInfo {
  used: number;
  size: number;
  cost?: { amount: number; currency: string };
}

export type AgentMode = 'plan' | 'execute' | string;

export interface PendingEdit {
  id: string;
  path: string;
  oldText: string;
  newText: string;
  toolCallId?: string;
  sessionId: string;
  status: 'pending' | 'applied' | 'rejected';
}
