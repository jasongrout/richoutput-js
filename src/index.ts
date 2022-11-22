import { IRenderMime } from '@jupyterlab/rendermime-interfaces';
import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin,
} from '@jupyterlab/application';
import { IRenderMimeRegistry } from '@jupyterlab/rendermime';
import { INotebookModel, INotebookTracker } from '@jupyterlab/notebook';
import { DocumentRegistry } from '@jupyterlab/docregistry';
import { Kernel, KernelMessage } from '@jupyterlab/services';
import { JSONObject } from '@lumino/coreutils';

import { Widget } from '@lumino/widgets';
import { IRender } from './typings';
import { RenderContext } from './render_context';
import { WidgetModels, IWidgetCommData } from './widgets';
import {
  CommCloseListener,
  ICommHost,
  CommMessageListener,
  IMessage,
} from './comm';

/**
 * The default mime type for the extension.
 */
const MIME_TYPE = 'application/vnd.jupyter.es6-rich-output';

/**
 * The class name added to the extension.
 */
const CLASS_NAME = 'mimerenderer-es6-rich-output';

/**
 * Initialization data for the js-module-renderer extension.
 */
const extension: JupyterFrontEndPlugin<void> = {
  id: 'richoutput-js:plugin',
  autoStart: true,
  requires: [IRenderMimeRegistry],
  optional: [INotebookTracker],

  activate: (
    app: JupyterFrontEnd,
    rendermimeRegistry: IRenderMimeRegistry,
    tracker: INotebookTracker | null
  ) => {
    // Default widget manager is -10;
    const rank = -100;
    rendermimeRegistry.addFactory(new RendererFactory(null), rank);

    if (tracker !== null) {
      tracker.forEach((panel) => {
        panel.content.rendermime.addFactory(
          new RendererFactory(panel.context),
          rank
        );
      });
      tracker.widgetAdded.connect((sender, panel) => {
        panel.content.rendermime.addFactory(
          new RendererFactory(panel.context),
          rank
        );
      });
    }
  },
};

type CommOpenListener = (commId: string, message: IMessage) => void;

class RendererFactory implements IRenderMime.IRendererFactory, ICommHost {
  readonly safe = false;
  readonly mimeTypes = [MIME_TYPE];
  private kernel: Kernel.IKernelConnection;
  private widgets = new WidgetModels();
  private readonly commMessageListeners = new Map<
    string,
    CommMessageListener[]
  >();
  private readonly commCloseListeners = new Map<string, CommCloseListener[]>();
  private readonly commOpenListeners = new Map<string, CommOpenListener[]>();

  constructor(
    private readonly context: DocumentRegistry.IContext<INotebookModel> | null
  ) {
    if (this.context) {
      context.sessionContext.kernelChanged.connect((sender, args) => {
        this.handleKernelChanged(args.oldValue, args.newValue);
      });

      context.sessionContext.statusChanged.connect((sender, args) => {
        // this._handleKernelStatusChange(args);
      });

      context.sessionContext.connectionStatusChanged.connect((sender, args) => {
        // this._handleKernelConnectionStatusChange(args);
      });

      if (
        context.sessionContext.session &&
        context.sessionContext.session.kernel
      ) {
        this.handleKernelChanged(null, context.sessionContext.session.kernel);
      }
    }
  }

  addMessageListener(commId: string, handler: (message: IMessage) => void) {
    let listeners = this.commMessageListeners.get(commId);
    if (!listeners) {
      listeners = [];
      this.commMessageListeners.set(commId, listeners);
    }
    listeners.push(handler);

    return () => {
      const index = listeners.indexOf(handler);
      listeners.splice(index, 1);
    };
  }

  addCloseListener(commId: string, handler: () => void) {
    let listeners = this.commCloseListeners.get(commId);
    if (!listeners) {
      listeners = [];
      this.commCloseListeners.set(commId, listeners);
    }
    listeners.push(handler);

    return () => {
      const index = listeners.indexOf(handler);
      listeners.splice(index, 1);
    };
  }

  registerTarget(
    targetName: string,
    handler: (commId: string, message: IMessage) => void
  ) {
    this.kernel.registerCommTarget(targetName, () => {
      // Callback isn't used, this uses the IOPub messages instead.
    });
    let listeners = this.commOpenListeners.get(targetName);
    if (!listeners) {
      listeners = [];
      this.commOpenListeners.set(targetName, listeners);
    }
    listeners.push(handler);
    return () => {
      const index = listeners.indexOf(handler);
      listeners.splice(index, 1);
    };
  }

  async sendCommOpen(
    targetName: string,
    commId: string,
    message: IMessage
  ): Promise<void> {
    const msg = KernelMessage.createMessage<
      KernelMessage.ICommOpenMsg<'shell'>
    >({
      msgType: 'comm_open',
      channel: 'shell',
      username: this.kernel.username,
      session: this.kernel.clientId,
      content: {
        comm_id: commId,
        data: message.data as JSONObject,
        target_name: targetName,
      },
      buffers: message.buffers,
    });

    await this.kernel.sendShellMessage(msg).done;
  }

  async sendCommMessage(commId: string, message: IMessage): Promise<void> {
    const msg = KernelMessage.createMessage<KernelMessage.ICommMsgMsg<'shell'>>(
      {
        msgType: 'comm_msg',
        channel: 'shell',
        username: this.kernel.username,
        session: this.kernel.clientId,
        content: {
          comm_id: commId,
          data: message.data as JSONObject,
        },
        buffers: message.buffers,
      }
    );
    await this.kernel.sendShellMessage(msg).done;
  }

  async sendCommClose(commId: string): Promise<void> {
    const msg = KernelMessage.createMessage<
      KernelMessage.ICommCloseMsg<'shell'>
    >({
      msgType: 'comm_close',
      channel: 'shell',
      username: this.kernel.username,
      session: this.kernel.clientId,
      content: {
        comm_id: commId,
        data: {},
      },
    });
    await this.kernel.sendShellMessage(msg).done;
  }

  private handleKernelChanged(
    oldValue: Kernel.IKernelConnection,
    newValue: Kernel.IKernelConnection
  ): void {
    this.kernel = newValue;
    this.widgets = new WidgetModels();

    this.kernel.iopubMessage.connect((sender, args) => {
      this.handleIoPubMessage(args);
    });
    this.kernel.registerCommTarget('jupyter.widget', (comm: Kernel.IComm) => {
      // Need to have a default handler or else the kernel will crash.
    });
    console.log('===== kernel is now: ', this.kernel);
  }

  handleIoPubMessage(msg: KernelMessage.IIOPubMessage) {
    console.log('====== got kernel iopub: ', msg);
    switch (msg.header.msg_type) {
      case 'comm_open': {
        this.onCommOpen(msg);
        break;
      }
      case 'comm_msg': {
        this.onCommMessage(msg);
        break;
      }
      case 'comm_close': {
        this.onCommClose(msg);
        break;
      }
    }
  }

  onCommOpen(msg: KernelMessage.IIOPubMessage) {
    const content = msg.content as ICommOpenContent;
    const buffers = msg.buffers.map(convertBuffer);
    this.widgets.onCommOpen(content.comm_id, content.data, buffers);
    const listeners = this.commOpenListeners.get(content.target_name);
    if (listeners) {
      for (const listener of listeners) {
        listener(content.comm_id, {
          data: content.data,
          buffers,
        });
      }
    }
  }

  onCommMessage(msg: KernelMessage.IIOPubMessage) {
    const content = msg.content as ICommContent;
    const buffers = msg.buffers.map(convertBuffer);
    this.widgets.onCommMessage(content.comm_id, content.data, buffers);
    const listeners = this.commMessageListeners.get(content.comm_id);
    if (listeners) {
      for (const listener of listeners) {
        listener({
          data: content.data,
          buffers,
        });
      }
    }
  }

  onCommClose(msg: KernelMessage.IIOPubMessage) {
    const content = msg.content as ICommContent;
    this.widgets.onCommClose(content.comm_id);
    const listeners = this.commCloseListeners.get(content.comm_id);
    if (listeners) {
      for (const listener of listeners) {
        listener();
      }
    }
  }

  createRenderer(options: IRenderMime.IRendererOptions): IRenderMime.IRenderer {
    return new OutputWidget(options, this.widgets, this);
  }
}

function convertBuffer(
  bufferOrView: ArrayBuffer | ArrayBufferView
): ArrayBuffer {
  if (bufferOrView instanceof ArrayBuffer) {
    return bufferOrView;
  }
  if (
    bufferOrView.byteOffset === 0 &&
    bufferOrView.byteLength === bufferOrView.buffer.byteLength
  ) {
    // If there's no byte offset and no truncated length then return the underlying buffer.
    return bufferOrView.buffer;
  }
  // Need to clone the buffer.
  const buffer = new ArrayBuffer(bufferOrView.byteLength);
  new Uint8Array(buffer).set(
    new Uint8Array(bufferOrView as unknown as ArrayBufferLike)
  );
  return buffer;
}

declare interface ICommContent {
  readonly comm_id: string;
  readonly data: IWidgetCommData;
}

declare interface ICommOpenContent {
  readonly target_name: string;
  readonly comm_id: string;
  readonly data: IWidgetCommData;
}

/**
 * A widget for rendering ES6 Rich Output.
 */
export class OutputWidget extends Widget implements IRenderMime.IRenderer {
  /**
   * Construct a new output widget.
   */
  constructor(
    options: IRenderMime.IRendererOptions,
    private readonly widgets: WidgetModels,
    private readonly commHost?: ICommHost
  ) {
    super();
    this._mimeType = options.mimeType;
    this.addClass(CLASS_NAME);
  }

  /**
   * Render ES6 Rich Output into this widget's node.
   */
  async renderModel(model: IRenderMime.IMimeModel): Promise<void> {
    const data = model.data[this._mimeType] as string;
    // Import module, call its render function
    console.log(model.data);
    console.log(`Rendering ${data}`);
    const module: IRender = await import(/* webpackIgnore: true */ data);
    const context = new RenderContext(this.widgets, this.commHost);
    const div = document.createElement('div');
    this.node.appendChild(div);
    await module?.render(
      { data: model.data, metadata: model.metadata },
      div,
      context.wrapper
    );
  }

  private _mimeType: string;
}

/**
 * A mime renderer factory for ES6 Rich Output data.
 */
// export const rendererFactory: IRenderMime.IRendererFactory = {
//   safe: true,
//   mimeTypes: [MIME_TYPE],
//   createRenderer: (options) => new OutputWidget(options),
// };

/**
 * Extension definition.
 */
// const extension: IRenderMime.IExtension = {
//   id: 'richoutput-js:plugin',
//   rendererFactory,
//   rank: 100,
//   dataType: 'string',
//   fileTypes: [
//     {
//       name: 'ES6 Rich Output',
//       mimeTypes: [MIME_TYPE],
//       extensions: ['.es6richoutput'],
//     },
//   ],
//   documentWidgetFactoryOptions: {
//     name: 'ES6 Rich Output',
//     primaryFileType: 'ES6 Rich Output',
//     fileTypes: ['ES6 Rich Output'],
//     defaultFor: ['ES6 Rich Output'],
//   },
// };

export default extension;
