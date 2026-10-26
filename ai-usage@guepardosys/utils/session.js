export const DEFAULT_RESET_PROMPT = 'Responda apenas: OK.';
export const sessionWindow = usage => usage?.windows?.find(w => w.kind !== 'scoped' && w.minutes >= 240 && w.minutes <= 360);
// A small message can start the window while rounded usage still reads 100%.
export function waitingForMessage(window, now = Date.now() / 1000) {
    return Boolean(window && window.minutes >= 240 && window.minutes <= 360 &&
        (!Number.isFinite(window.reset) || window.reset <= now));
}
export function visibleReset(window, now = Date.now() / 1000) {
    return waitingForMessage(window, now) ? null : window?.reset;
}
export function shouldSendResetMessage(usage, lastAttempt = 0, now = Date.now() / 1000) {
    const window = sessionWindow(usage);
    // Claude may omit five_hour entirely while no session is active.
    if (window ? !waitingForMessage(window, now) :
        !usage?.windows?.some(w => w.kind !== 'scoped')) return false;
    // A previous attempt may have started a window before the usage endpoint catches up.
    return now - lastAttempt >= 300;
}
