import { app, safeStorage } from 'electron'
import { join } from 'path'
import { randomBytes, scryptSync, timingSafeEqual } from 'crypto'
import fse from 'fs-extra'

/**
 * 应用密码锁(PIN)。凭据强化沿用墨鱼的思路:
 *   scrypt(pin, salt) -> 派生密钥,再整体用 OS 级 safeStorage 加密后落盘。
 * 完全本地、离线;不联网、不涉及任何服务器。
 */
const file = () => join(app.getPath('userData'), 'lock.bin')

interface Stored {
  salt: string // hex
  hash: string // hex
}

function derive(pin: string, saltHex: string): Buffer {
  return scryptSync(pin, Buffer.from(saltHex, 'hex'), 32, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 })
}

export const lock = {
  available(): boolean {
    return safeStorage.isEncryptionAvailable()
  },

  isEnabled(): boolean {
    return fse.existsSync(file())
  },

  async setPin(pin: string): Promise<boolean> {
    if (!/^\d{4,8}$/.test(pin)) return false
    if (!safeStorage.isEncryptionAvailable()) return false
    const salt = randomBytes(16).toString('hex')
    const hash = derive(pin, salt).toString('hex')
    const enc = safeStorage.encryptString(JSON.stringify({ salt, hash } as Stored))
    await fse.writeFile(file(), enc)
    return true
  },

  verify(pin: string): boolean {
    try {
      const enc = fse.readFileSync(file())
      const { salt, hash } = JSON.parse(safeStorage.decryptString(enc)) as Stored
      const candidate = derive(pin, salt)
      const expected = Buffer.from(hash, 'hex')
      return candidate.length === expected.length && timingSafeEqual(candidate, expected)
    } catch {
      return false
    }
  },

  async disable(pin: string): Promise<boolean> {
    if (!this.verify(pin)) return false
    await fse.remove(file())
    return true
  },
}
