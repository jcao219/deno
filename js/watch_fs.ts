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
    | "unknown"
    | "accessed"
    | "created"
    | "metadataChanged"
    | "modified"
    | "removed"
    | "renamed"
    | "watcherClosed";
  eventDetail:
    | "unknown"
    | "file"
    | "folder"
    | "data"
    | "dataContent"
    | "dataSize"
    | "accessTime"
    | "extended"
    | "ownership"
    | "permissions"
    | "writeTime"
    | "read"
    | "closed"
    | "closedExecute"
    | "closedRead"
    | "closedWrite"
    | "opened"
    | "openedExecute"
    | "openedRead"
    | "openedWrite";
}

function assertExhaustive(param: never): never {
  throw new Error("Unexpected flatbuffer value: " + param);
}
function eventTypeMap(event: msg.FsWatcherEvent): FsWatchEvent["eventType"] {
  switch (event) {
    case msg.FsWatcherEvent.Unknown:
      return "unknown";
    case msg.FsWatcherEvent.Accessed:
      return "accessed";
    case msg.FsWatcherEvent.Created:
      return "created";
    case msg.FsWatcherEvent.MetadataChanged:
      return "metadataChanged";
    case msg.FsWatcherEvent.Modified:
      return "modified";
    case msg.FsWatcherEvent.Removed:
      return "removed";
    case msg.FsWatcherEvent.Renamed:
      return "renamed";
    case msg.FsWatcherEvent.WatcherClosed:
      return "watcherClosed";
  }
  assertExhaustive(event);
}
function eventDetailMap(detail: msg.FsWatcherEventDetail): FsWatchEvent["eventDetail"] {
  switch (detail) {
    case msg.FsWatcherEventDetail.Unknown:
    return "unknown";
    case msg.FsWatcherEventDetail.File:
    return "file";
    case msg.FsWatcherEventDetail.Folder:
    return "folder";
    case msg.FsWatcherEventDetail.Data:
    return "data";
    case msg.FsWatcherEventDetail.DataContent:
    return "dataContent";
    case msg.FsWatcherEventDetail.DataSize:
    return "dataSize";
    case msg.FsWatcherEventDetail.AccessTime:
    return "accessTime";
    case msg.FsWatcherEventDetail.Extended:
    return "extended";
    case msg.FsWatcherEventDetail.Ownership:
    return "ownership";
    case msg.FsWatcherEventDetail.Permissions:
    return "permissions";
    case msg.FsWatcherEventDetail.WriteTime:
    return "writeTime";
    case msg.FsWatcherEventDetail.Read:
    return "read";
    case msg.FsWatcherEventDetail.Closed:
    return "closed";
    case msg.FsWatcherEventDetail.ClosedExecute:
    return "closedExecute";
    case msg.FsWatcherEventDetail.ClosedRead:
    return "closedRead";
    case msg.FsWatcherEventDetail.ClosedWrite:
    return "closedWrite";
    case msg.FsWatcherEventDetail.Opened:
    return "opened";
    case msg.FsWatcherEventDetail.OpenedExecute:
    return "openedExecute";
    case msg.FsWatcherEventDetail.OpenedRead:
    return "openedRead";
    case msg.FsWatcherEventDetail.OpenedWrite:
    return "openedWrite";
  }
}

class FsWatcherImpl implements FsWatcher {
  readonly rid: number;

  constructor(pathsInput: string[], options: WatchOptions) {
    const { recursive = false, debounceMs = 2000 } = options;

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
      eventType: eventTypeMap(res.event()),
      eventDetail: eventDetailMap(res.detail()),
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
