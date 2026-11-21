export const NICKNAME_STORAGE_KEY = "mori:games:nickname";
export const PROFILE_SOURCE_STORAGE_KEY = "mori:games:profile-source";
export const MAX_NICKNAME_LENGTH = 24;
export const MAX_GITHUB_NICKNAME_LENGTH = 256;

const CONTROL_CHAR_PATTERN = /[\p{Cc}\p{Cf}]/u;
const ROOM_CODE_PATTERN = /^[A-HJ-NP-Z2-9]{8}$/;

export function isValidNickname(value, maxLength = MAX_NICKNAME_LENGTH) {
  return (
    value.trim().length > 0 &&
    value.length <= maxLength &&
    !CONTROL_CHAR_PATTERN.test(value)
  );
}

export function isValidRoomCode(value) {
  return ROOM_CODE_PATTERN.test(value);
}
