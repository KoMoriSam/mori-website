export const MOBILE_READER_EVENTS = Object.freeze({
  SHOW_NAVBAR: "mobile-reader:show-navbar",
  HIDE_NAVBAR: "mobile-reader:hide-navbar",
  VOLUME_KEY: "mobile-reader:volume-key",
  OPEN_CONTROL: "mobile-reader:open-control",
});

const CONTROL_PANEL_NAMES = new Set(["toc", "search", "comments"]);
const COMMENT_MAPPINGS = new Set(["title", "specific"]);

export const setMobileReaderNavbarVisible = (visible) => {
  window.dispatchEvent(
    new Event(
      visible
        ? MOBILE_READER_EVENTS.SHOW_NAVBAR
        : MOBILE_READER_EVENTS.HIDE_NAVBAR,
    ),
  );
};

export const onMobileReaderNavbarVisibility = ({ onShow, onHide }) => {
  window.addEventListener(MOBILE_READER_EVENTS.SHOW_NAVBAR, onShow);
  window.addEventListener(MOBILE_READER_EVENTS.HIDE_NAVBAR, onHide);
  return () => {
    window.removeEventListener(MOBILE_READER_EVENTS.SHOW_NAVBAR, onShow);
    window.removeEventListener(MOBILE_READER_EVENTS.HIDE_NAVBAR, onHide);
  };
};

export const parseMobileReaderVolumeDirection = (direction) => {
  if (direction === "down" || direction === "next" || direction === 1) {
    return 1;
  }
  if (direction === "up" || direction === "previous" || direction === -1) {
    return -1;
  }
  return 0;
};

export const onMobileReaderVolumeKey = (handler) => {
  const listener = (event) => {
    const direction = parseMobileReaderVolumeDirection(event.detail?.direction);
    if (direction) handler(direction, event);
  };
  window.addEventListener(MOBILE_READER_EVENTS.VOLUME_KEY, listener);
  return () => {
    window.removeEventListener(MOBILE_READER_EVENTS.VOLUME_KEY, listener);
  };
};

export const normalizeMobileReaderControlRequest = (detail) => {
  const request =
    typeof detail === "string"
      ? { name: detail }
      : detail && typeof detail === "object"
        ? detail
        : null;
  if (!request || !CONTROL_PANEL_NAMES.has(request.name)) return null;
  return {
    name: request.name,
    keyword: typeof request.keyword === "string" ? request.keyword : "",
    mapping: COMMENT_MAPPINGS.has(request.mapping) ? request.mapping : "",
  };
};

export const dispatchMobileReaderOpenControl = (detail) => {
  window.dispatchEvent(
    new CustomEvent(MOBILE_READER_EVENTS.OPEN_CONTROL, { detail }),
  );
};

export const onMobileReaderOpenControl = (handler) => {
  const listener = (event) => {
    const request = normalizeMobileReaderControlRequest(event.detail);
    if (request) handler(request, event);
  };
  window.addEventListener(MOBILE_READER_EVENTS.OPEN_CONTROL, listener);
  return () => {
    window.removeEventListener(MOBILE_READER_EVENTS.OPEN_CONTROL, listener);
  };
};
