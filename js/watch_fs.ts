// Copyright 2019 the Deno authors. All rights reserved. MIT license.
import * as flatbuffers from "./flatbuffers";
import * as msg from "gen/cli/msg_generated";
import * as dispatch from "./dispatch";
import { assert } from "./util";
import { Closer } from "./io";

export type FsWatcher = AsyncIterableIterator<FsWatchEvent> & Closer;

export interface WatchOptions {
  recursive?: boolean;
  debounceMs?: number;
}

export interface FsWatchEvent {
  source: string | null;
  destination: string | null;
  eventType:
    | "noticeWrite"
    | "noticeRemove"
    | "create"
    | "write"
    | "chmod"
    | "remove"
    | "rename"
    | "rescan"
    | "watcherClosed";
}

function assertExhaustive(param: never): never {
  throw new Error("Unexpected case" + param);
}
function eventTypeMap(event: msg.FsWatcherEvent): FsWatchEvent["eventType"] {
  switch (event) {
    case msg.FsWatcherEvent.Chmod:
      return "chmod";
    case msg.FsWatcherEvent.Create:
      return "create";
    case msg.FsWatcherEvent.NoticeRemove:
      return "noticeRemove";
    case msg.FsWatcherEvent.NoticeWrite:
      return "noticeWrite";
    case msg.FsWatcherEvent.Remove:
      return "remove";
    case msg.FsWatcherEvent.Rename:
      return "rename";
    case msg.FsWatcherEvent.Rescan:
      return "rescan";
    case msg.FsWatcherEvent.Write:
      return "write";
    case msg.FsWatcherEvent.WatcherClosed:
      return "watcherClosed";
  }
  assertExhaustive(event);
}

class FsWatcherImpl implements FsWatcher {
  readonly rid: number;

  constructor(pathsInput: string[], options: WatchOptions) {
    const { recursive = false, debounceMs = 500 } = options;

    const builder = flatbuffers.createBuilder();
    const pathsOffset = pathsInput.map(
      (path: string): flatbuffers.Offset => builder.createString(path)
    );
    const paths = msg.FsOpenWatcher.createPathsVector(builder, pathsOffset);
    const inner = msg.FsOpenWatcher.createFsOpenWatcher(
      builder,
      debounceMs,
      recursive,
      paths
    );
    const baseRes = dispatch.sendSync(builder, msg.Any.FsOpenWatcher, inner);
    assert(baseRes != null);
    assert(baseRes!.innerType() === msg.Any.OpenRes);
    const res = new msg.OpenRes();
    assert(baseRes!.inner(res) != null);
    this.rid = res.rid();
  }

  async next(): Promise<IteratorResult<FsWatchEvent>> {
    const builder = flatbuffers.createBuilder();
    const inner = msg.FsPollWatcher.createFsPollWatcher(builder, this.rid);
    const baseRes = await dispatch.sendAsync(
      builder,
      msg.Any.FsPollWatcher,
      inner
    );
    assert(baseRes != null);
    assert(baseRes!.innerType() === msg.Any.FsPollWatcherRes);
    const res = new msg.FsPollWatcherRes();
    assert(baseRes!.inner(res) != null);
    const event: FsWatchEvent = {
      source: res.source(),
      destination: res.destination(),
      eventType: eventTypeMap(res.event())
    };
    return { value: event, done: event.eventType === "watcherClosed" };
  }

  close(): void {
    const builder = flatbuffers.createBuilder();
    const inner = msg.Close.createClose(builder, this.rid);
    dispatch.sendSync(builder, msg.Any.Close, inner);
  }

  [Symbol.asyncIterator](): AsyncIterableIterator<FsWatchEvent> {
    return this;
  }
}

export function watch(
  paths: string | string[],
  options: WatchOptions = {}
): FsWatcher {
  return new FsWatcherImpl(Array.isArray(paths) ? paths : [paths], options);
}
