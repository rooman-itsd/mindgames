/**
 * Opens the "Share your win" dialog (ShareWinModal, mounted in AppLayout)
 * from anywhere — a toast action, a post card — without prop drilling.
 */
export const SHARE_WIN_EVENT = 'rc:share-win'
export type ShareWin = { headline: string; name: string; role?: string }

export function openShareWin(win: ShareWin) {
  window.dispatchEvent(new CustomEvent<ShareWin>(SHARE_WIN_EVENT, { detail: win }))
}
