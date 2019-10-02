// Copyright 2019 the Deno authors. All rights reserved. MIT license.
import { sendSync, sendAsync } from "./dispatch_json.ts";
import * as dispatch from "./dispatch.ts";
import { Closer } from "./io.ts";

export type FsWatcher = AsyncIterableIterator<unknown> & Closer;

export interface WatchOptions {
    recursive?: boolean;
    debounceMs?: number;
}

class FsWatcherImpl implements FsWatcher {
  readonly rid: number;

  constructor(paths: string[], options: WatchOptions) {
    const { recursive = false, debounceMs = 500 } = options;
    this.rid = sendSync(dispatch.OP_FS_OPEN_WATCHER, { recursive, paths, debounceMs });
  }

  async next(): Promise<IteratorResult<unknown>> {
    const res = await sendAsync(dispatch.OP_FS_POLL_WATCHER, { rid: this.rid });
    return { value: res, done: false };
    // return { value: event, done: event.eventType === "watcherClosed" };
  }

  close(): void {
    sendSync(dispatch.OP_CLOSE, { rid: this.rid });
  }

  [Symbol.asyncIterator](): AsyncIterableIterator<unknown> {
    return this;
  }
}

export function watch(
  paths: string | string[],
  options: WatchOptions = {}
): FsWatcher {
  return new FsWatcherImpl(Array.isArray(paths) ? paths : [paths], options);
}