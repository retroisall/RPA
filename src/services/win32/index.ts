import { singletonGetter } from '../../common/ts_utils'
import { NativeMessagingHost } from '../native_host'
import type { Rect } from '../xy'

class KantuWin32Host extends NativeMessagingHost {
  private static readonly HOST_NAME = 'com.a9t9.kantu.win32'
  constructor() {
    super(KantuWin32Host.HOST_NAME)
  }
}

export interface Win32API {
  getWindowRect: (title: string) => Promise<Rect & { title: string }>
}

export const getWin32API = singletonGetter((): Win32API => {
  const host = new KantuWin32Host()
  let pReady = host.connectAsync().catch((e: any) => { throw e })

  return {
    getWindowRect: (title: string) =>
      pReady.then(() => (host as any).invokeAsync('get_window_rect', { title }))
  }
})
