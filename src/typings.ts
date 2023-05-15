export interface IOutput {
  data: { [index: string]: any };
  metadata: { [index: string]: any };
}

export interface IRender {
  render?(
    output: IOutput,
    element: HTMLDivElement,
    context: IContext
  ): Promise<void>;
}

export declare interface IContext {
  readonly comms?: IComms;
}

export declare interface IComms {
  /**
   * Open a new comm channel to the kernel.
   *
   * The kernel should have registered a handler following the documentation
   * at
   * https://jupyter-notebook.readthedocs.io/en/stable/comms.html#opening-a-comm-from-the-frontend.
   *
   * @param targetName The name of the channel registered on the kernel.
   * @param data Any data to be sent with the open message.
   * @param buffers Any binary data to be sent with the open message.
   * @return The established comm channel.
   */
  open(
    targetName: string,
    data?: JsonType,
    buffers?: ArrayBuffer[]
  ): Promise<IComm>;

  /**
   * Listen comm channels opened by the kernel.
   *
   * See
   * https://jupyter-notebook.readthedocs.io/en/stable/comms.html#opening-a-comm-from-the-kernel.
   *
   * @param targetName The name used by the kernel to open a new comm channel.
   * @param callback Function invoked with any new comm channels.
   */
  registerTarget(targetName: string, callback: (comm: IComm) => void): void;
}

export declare interface IModelState {
  readonly modelName: string;
  readonly modelModule: string;
  readonly modelModuleVersion?: string;
  readonly state: { [key: string]: unknown };

  /**
   * If connected to a kernel then this is the comm channel to the kernel.
   * This will only be set if currently connected to a kernel.
   */
  readonly comm?: IComm;
}

/** Placeholder for any JSON serializable type. */
// tslint:disable-next-line:no-any
export type JsonType = any;

export interface ICommMessage {
  /** The JSON structured data of the message. */
  readonly data: JsonType;
  /** Optional binary buffers transferred with the message. */
  readonly buffers?: ArrayBuffer[];
}

export interface IComm {
  /**
   * Send a comm message to the kernel.
   * @param data The message data to be sent.
   * @param opts Any binary buffers to be included in the message.
   * @return Promise which will be resolved when the kernel successfully
   *     receives the comm message.
   */
  send(data: JsonType, opts?: { buffers?: ArrayBuffer[] }): Promise<void>;
  /**
   * Closes the comm channel and notifies the kernel that the channel
   * is closed.
   */
  close(): void;
  /**
   * An async iterator of the incoming messages from the kernel.
   * The iterator will end when the comm channel is closed.
   */
  readonly messages: AsyncIterable<ICommMessage>;
}
