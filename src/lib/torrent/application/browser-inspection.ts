/** Browser-facing use cases for identity parsing and local .torrent inspection. */
export {
  fetchTorrentSubtitle,
  inspectTorrent,
  TorrentClientError,
  type TorrentClientError as BrowserTorrentError,
} from "../torrent-client";
