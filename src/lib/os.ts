export type OsName = 'linux' | 'win' | 'mac';

/** Система и архитектура посетителя — те же правила, что и для подсветки карточек. */
export function detectOs(): { os: OsName; arm: boolean } {
  const ua = navigator.userAgent;
  const os: OsName = /Windows/.test(ua) ? 'win' : /Mac/.test(ua) ? 'mac' : 'linux';
  const na = navigator as Navigator & { userAgentData?: { architecture?: string } };
  const arm = na.userAgentData?.architecture === 'arm';
  return { os, arm };
}

/** Ссылка главной кнопки для системы и архитектуры посетителя. */
export function chooseUrl(
  os: OsName,
  arm: boolean,
  urls: { linux: string; win: string; macArm: string; macX64: string },
): string {
  return os === 'win' ? urls.win : os === 'mac' ? (arm ? urls.macArm : urls.macX64) : urls.linux;
}
