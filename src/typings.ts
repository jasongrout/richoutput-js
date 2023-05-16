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

export type DisposeCallback = () => void;
export type CommMessageListener = (message: ICommMessage) => void;
export type CommCloseListener = () => void;


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
   * Register a callback to be called when a comm message is received.
   * @param callback The callback to be called when a comm message is received.
   * @return A disposable which will unregister the callback.
   **/
  onMessage(callback: CommMessageListener): () => void;

  /**
   * Register a callback to be called when the comm is closed from the kernel.
   * @param callback The callback to be called when the comm is closed.
   * @return A disposable which will unregister the callback.
   **/
  onClose(callback: () => void): () => void;

  /**
   * Closes the comm channel and notifies the kernel that the channel
   * is closed.
   */
  close(): void; 
}


export interface ICommHost {
  addMessageListener(
    commId: string,
    handler: CommMessageListener
  ): DisposeCallback;
  addCloseListener(commId: string, handler: CommCloseListener): DisposeCallback;
  sendCommOpen(
    targetName: string,
    commId: string,
    message: ICommMessage
  ): Promise<void>;
  sendCommMessage(commId: string, message: ICommMessage): Promise<void>;
  sendCommClose(commId: string): Promise<void>;
  registerTarget(
    targetName: string,
    callback: (commId: string, message: ICommMessage) => void
  ): DisposeCallback;
}