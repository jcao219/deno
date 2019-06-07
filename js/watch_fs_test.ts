// Copyright 2019 the Deno authors. All rights reserved. MIT license.
import { test, testPerm, assert, assertStrictEq } from "./test_util.ts";

testPerm({ read: true, write: true }, async function noticedWrite(): Promise<
  void
> {
  const watchDir = Deno.makeTempDirSync();
  const fileName = watchDir + "/test";
  await Deno.writeFile(fileName, new Uint8Array());
  const watcher = Deno.watch(watchDir);
  Deno.writeFile(fileName, Uint8Array.of(32)); // fire and forget
  const { value, done } = await watcher.next();
  assert(!done);
  assertStrictEq(value.eventType, "noticeWrite");
  assertStrictEq(value.source, fileName);
  assertStrictEq(value.destination, null);
});

test(async function watcherClosedWhileWatching(): Promise<void> {
  const watcher = Deno.watch([]);
  const promise = watcher.next();
  setTimeout((): void => watcher.close(), 10);
  const { value, done } = await promise;
  assert(done);
  assertStrictEq(value.eventType, "watcherClosed");
  assertStrictEq(value.source, null);
  assertStrictEq(value.destination, null);
});
