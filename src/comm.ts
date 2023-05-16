import { CommCloseListener, CommMessageListener, DisposeCallback, IComm, ICommHost, ICommMessage } from './typings';

export class CommChannel {
  
  private onMessageCallbacks: Array<CommMessageListener> = [];
  private onCloseCallbacks: Array<CommCloseListener> = [];

  private readonly bufferedMessages: ICommMessage[] = [];
  private readonly messageDispose: DisposeCallback;
  private readonly closeDispose: DisposeCallback;

  constructor(
    private readonly commId: string,
    private readonly host: ICommHost
  ) {
    this.messageDispose = this.host.addMessageListener(
      this.commId,
      (message) => {
        if (this.onMessageCallbacks.length > 0) {
          // TODO: is this the right condition? What happens if you add a
          // listener, and then remove it. Do we want to buffer messages in that case?
          for (const callback of this.onMessageCallbacks) {
            callback(message);
          }
        } else {
          this.bufferedMessages.push(message);
        }
      }
    );
    this.closeDispose = this.host.addCloseListener(this.commId, () => {
      for (const callback of this.onCloseCallbacks) {
        callback();
      }
      this.dispose();
    });
  }

  // /** Sends a comm open message to the kernel. */
  async open(
    targetName: string,
    data: unknown,
    buffers?: ArrayBuffer[]
  ): Promise<void> {
    try {
      await this.host.sendCommOpen(targetName, this.commId, {
        data,
        buffers,
      });
    } catch (error: unknown) {
      // If the open fails then we want to close the comms to remove the
      // listener.
      this.close();
      throw error;
    }
  }

  /** Sends the data to the kernel. */
  async send(
    data: unknown,
    { buffers }: { buffers?: ArrayBuffer[] } = {}
  ): Promise<void> {
    await this.host.sendCommMessage(this.commId, { data, buffers });
  }


  private onMessage(callback: CommMessageListener): DisposeCallback {
    this.onMessageCallbacks.push(callback);

    // Send any buffered messages to the new listener.
    for (const message of this.bufferedMessages) {
      callback(message);
    }
    this.bufferedMessages.length = 0;

    return () => {
      const index = this.onMessageCallbacks.indexOf(callback);
      if (index !== -1) {
        this.onMessageCallbacks.splice(index, 1);
      }
    };
  }

  private onClose(callback: CommCloseListener): DisposeCallback {
    this.onCloseCallbacks.push(callback);
    return () => {
      const index = this.onCloseCallbacks.indexOf(callback);
      if (index !== -1) {
        this.onCloseCallbacks.splice(index, 1);
      }
    };
  }

  private dispose() {
    this.messageDispose();
    this.closeDispose();
  }

  /** Sends a message to the kernel to close this comm channel. */
  close(): void {
    this.host
      .sendCommClose(this.commId)
      .catch((error: unknown) => {
        // Only log a warning here, assume closed.
        console.warn(`Error closing comm channel ${this.commId}`, error);
      })
      .then(() => {
        // This should be done in response to a kernel close message.
        // TODO: am I double calling these callbacks?
        for (const callback of this.onCloseCallbacks) {
          callback();
        }
      });
  }

  /**
   * @return A wrapper to avoid exposing implementation details to user code.
   */
  getWrapper(): IComm {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const comm = this;
    return {
      /** @export */
      send(data: unknown, opts?: { buffers?: ArrayBuffer[] }): Promise<void> {
        return comm.send(data, opts);
      },
      /** @export */
      onMessage(callback: CommMessageListener): DisposeCallback {
        return comm.onMessage(callback);
      },
      /** @export */
      onClose(callback: CommCloseListener): DisposeCallback {
        return comm.onClose(callback);
      },
      /** @export */
      close() {
        comm.close();
      },
    };
  }
}
