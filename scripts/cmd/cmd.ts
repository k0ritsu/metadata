export class CmdError extends Error {}

export interface CommandHandler {
  (args: string[]): Promise<void>;
}
