export const DEFAULT_RESET_PROMPT = 'Responda apenas: OK.';
export const sessionWindow = usage => usage?.windows?.find(w => w.kind !== 'scoped' && w.minutes >= 240 && w.minutes <= 360);
export function waitingForMessage(window, now = Date.now() / 1000) {
    return Boolean(window && window.minutes >= 240 && window.minutes <= 360 &&
        (window.remaining === 100 || (Number.isFinite(window.reset) && window.reset > 0 && window.reset <= now)));
}
export function visibleReset(window, now = Date.now() / 1000) {
    return waitingForMessage(window, now) ? null : window?.reset;
}
export function shouldSendResetMessage(usage, lastAttempt = 0, now = Date.now() / 1000) {
    const window = sessionWindow(usage);
    if (!waitingForMessage(window, now)) return false;
    // A previous attempt may have started a window before the usage endpoint catches up.
    return now - lastAttempt >= window.minutes * 60;
}
