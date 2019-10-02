use super::dispatch_json::{blocking_json, Deserialize, JsonOp, Value};
use crate::resources;
use crate::state::ThreadSafeState;
use notify::{Watcher, RecommendedWatcher, RecursiveMode, DebouncedEvent};
use deno::*;
use std::sync::mpsc::{channel, RecvError};
use std::time::Duration;
use std::path::PathBuf;
use serde::Serialize;
use std::convert::TryFrom;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct OpenWatcherArgs {
  recursive: bool,
  paths: Vec<String>,
  debounce_ms: u64
}

pub fn op_fs_open_watcher(
  state: &ThreadSafeState,
  args: Value,
  _zero_copy: Option<PinnedBuf>,
) -> Result<JsonOp, ErrBox> {
  let args: OpenWatcherArgs = serde_json::from_value(args)?;
  let (tx, rx) = channel();
  let debounce_interval = Duration::from_millis(args.debounce_ms.into());
  let mut watcher: RecommendedWatcher = Watcher::new(tx, debounce_interval)?;

  let recursive_mode: RecursiveMode = if args.recursive {
    RecursiveMode::Recursive
  } else {
    RecursiveMode::NonRecursive
  };
  for path in &args.paths {
    state.check_read(path)?;
    watcher.watch(path, recursive_mode)?;
  }

  let resource = resources::add_fs_watcher(watcher, rx);
  Ok(JsonOp::Sync(json!(resource.rid)))
}

#[derive(Deserialize)]
struct PollWatcherArgs {
  rid: i32,
}

pub fn op_fs_poll_watcher(
  _state: &ThreadSafeState,
  args: Value,
  _zero_copy: Option<PinnedBuf>,
) -> Result<JsonOp, ErrBox> {
  let args: PollWatcherArgs = serde_json::from_value(args)?;
  let is_sync = false;
  blocking_json(is_sync, move || {
    debug!("op_fs_poll_watcher");
    let maybe_event: Result<DebouncedEvent, RecvError> = {
      let rx_mutex = resources::get_receiver_for_fs_watcher(args.rid as u32);
      let rx = rx_mutex.lock().unwrap();
      rx.recv() // blocks
    };
    let wrapped = EventWrapper::try_from(maybe_event)?;
    Ok(json!(wrapped))
  })
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
enum FsEvent {
  NoticeWrite,
  NoticeRemove,
  Create,
  Write,
  Chmod,
  Remove,
  Rename,
  Rescan,
  WatcherClosed,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct EventWrapper {
  event: FsEvent,
  #[serde(skip_serializing_if = "Option::is_none")]
  source: Option<PathBuf>,
  #[serde(skip_serializing_if = "Option::is_none")]
  destination: Option<PathBuf>,
}

impl TryFrom<Result<DebouncedEvent, RecvError>> for EventWrapper {
  type Error = notify::Error;
  fn try_from(maybe_event: Result<DebouncedEvent, RecvError>) -> Result<Self, Self::Error> {
    match maybe_event {
      Err(_) => Ok(EventWrapper { event: FsEvent::WatcherClosed, source: None, destination: None }),
      Ok(event) => match event {
        DebouncedEvent::NoticeWrite(path) =>
          Ok(EventWrapper { event: FsEvent::NoticeWrite, source: Some(path), destination: None }),
        DebouncedEvent::NoticeRemove(path) =>
          Ok(EventWrapper { event: FsEvent::NoticeRemove, source: Some(path), destination: None }),
        DebouncedEvent::Create(path) =>
          Ok(EventWrapper { event: FsEvent::Create, source: Some(path), destination: None }),
        DebouncedEvent::Write(path) =>
          Ok(EventWrapper { event: FsEvent::Write, source: Some(path), destination: None }),
        DebouncedEvent::Chmod(path) =>
          Ok(EventWrapper { event: FsEvent::Chmod, source: Some(path), destination: None }),
        DebouncedEvent::Remove(path) =>
          Ok(EventWrapper { event: FsEvent::Remove, source: Some(path), destination: None }),
        DebouncedEvent::Rename(src, dest) =>
          Ok(EventWrapper { event: FsEvent::Rename, source: Some(src), destination: Some(dest) }),
        DebouncedEvent::Rescan =>
          Ok(EventWrapper { event: FsEvent::Rescan, source: None, destination: None }),
        DebouncedEvent::Error(err, _maybe_path) => Err(err),
      }
    }
  }
}