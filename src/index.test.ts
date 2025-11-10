import { aborts } from './index'
import {jest} from '@jest/globals'

function delay(ms: number): Promise<void> {
    return new Promise<void>(
        res => setTimeout(res, ms),
    )
}

describe('aborts.create', () => {
    test('propagates parent abort to child', async () => {
        const parent = new AbortController()
        const child = aborts.create(parent.signal)

        expect(child.signal.aborted).toBe(false)

        const reasons: any[] = []
        child.signal.addEventListener('abort', (ev: any) => reasons.push(ev.target.reason))

        parent.abort('parent-reason')

        // allow microtask queue
        await Promise.resolve()

        expect(child.signal.aborted).toBe(true)
        // reason should be forwarded
        expect(reasons.length).toBeGreaterThan(0)
        expect(reasons[0]).toBe('parent-reason')
        child.abort('another-reason')
        // calling abort again should be no-op
        expect(reasons.length).toBe(1)
        expect(reasons[0]).toBe('parent-reason')
    })

    test('returns no-op controller when parent already aborted', () => {
        const parent = new AbortController()
        parent.abort('already')

        const child = aborts.create(parent.signal)
        expect(child.signal.aborted).toBe(true)
        expect(child.signal.reason).toBe('already')
        // calling abort on the returned controller should be a no-op and not throw
        child.abort('another')
        expect(child.signal.reason).toBe('already')
    })

    test('undefined parent', async () => {
        const child = aborts.create(undefined)
        expect(child.signal.aborted).toBe(false)

        const reasons: any[] = []
        child.signal.addEventListener('abort', (ev: any) => reasons.push(ev.target.reason))

        child.abort('manual-abort')

        // allow microtask queue
        await Promise.resolve()

        expect(child.signal.aborted).toBe(true)
        expect(reasons.length).toBeGreaterThan(0)
        expect(reasons[0]).toBe('manual-abort')
    })

    test('parent is not aborted', () => {
        const parent = new AbortController()
        const child = aborts.create(parent.signal)
        expect(child.signal.aborted).toBe(false)
        expect(parent.signal.aborted).toBe(false)

        child.abort('child-abort')
        expect(child.signal.aborted).toBe(true)
        expect(child.signal.reason).toBe('child-abort')
        expect(parent.signal.aborted).toBe(false)
    })

    test('is compatible with native AbortController', async () => {
        const parent = new AbortController()
        expect(parent).toBeInstanceOf(AbortController)
        parent.abort('parent-abort')
        const child = aborts.create(parent.signal)

        expect(child).toBeInstanceOf(AbortController)
    })

    test('is disposable', async () => {
        let ac: AbortController|undefined
        (() => {
            using ac2 = aborts.create()
            ac = ac2
            expect(ac2.signal.aborted).toBe(false)
        })()
        expect(ac?.signal.aborted).toBe(true)
    })
})

describe('aborts.timeout', () => {
    const getNativeTimeoutError = async () => {
        const s = AbortSignal.timeout(0)
        await delay(0)
        return s.reason
    }

    test('aborts after timeout', async () => {
        const timeoutMs = 1000
        const controller = aborts.timeout(timeoutMs)
        expect(controller.signal.aborted).toBe(false)

        const reasons: any[] = []
        controller.signal.addEventListener('abort', (ev: any) => reasons.push(ev.target.reason))

        await delay(500)

        expect(controller.signal.aborted).toBe(false)

        await delay(1000)

        expect(controller.signal.aborted).toBe(true)
        expect(reasons.length).toBeGreaterThan(0)
        expect(reasons[0]).toEqual(await getNativeTimeoutError())

        controller.abort('another-reason')
        // calling abort again should be no-op
        expect(reasons.length).toBe(1)
        expect(reasons[0]).toEqual(await getNativeTimeoutError())
    })

    test('negative timeout', async () => {
        const timeoutMs = -1000
        const controller = aborts.timeout(timeoutMs)
        expect(controller.signal.aborted).toBe(true)
        expect(controller.signal.reason).toEqual(await getNativeTimeoutError())
    })

    test('negative timeout with cancelled parent', async () => {
        const parent = new AbortController()
        parent.abort('parent-abort')

        const timeoutMs = -1000
        const controller = aborts.timeout(timeoutMs, parent.signal)
        expect(controller.signal.aborted).toBe(true)
        expect(controller.signal.reason).toBe('parent-abort')
        controller.abort('another-abort')
        expect(controller.signal.reason).toBe('parent-abort')
    })

    test('undefined parent', async () => {
        const controller = aborts.timeout(1000, undefined)
        expect(controller.signal.aborted).toBe(false)

        const reasons: any[] = []
        controller.signal.addEventListener('abort', (ev: any) => reasons.push(ev.target.reason))
        controller.abort('manual-abort')

        // allow microtask queue
        await Promise.resolve()
        expect(controller.signal.aborted).toBe(true)
        expect(reasons.length).toBeGreaterThan(0)
        expect(reasons[0]).toBe('manual-abort')
        await delay(1100)
        // should not change after timeout
        expect(controller.signal.aborted).toBe(true)
        expect(reasons.length).toBe(1)
        expect(reasons[0]).toBe('manual-abort')
    })

    test('propagates parent abort to child', async () => {
        const parent = new AbortController()
        const child = aborts.timeout(5000, parent.signal)

        expect(child.signal.aborted).toBe(false)

        const reasons: any[] = []
        child.signal.addEventListener('abort', (ev: any) => reasons.push(ev.target.reason))

        parent.abort('parent-reason')
        // allow microtask queue
        await Promise.resolve()

        expect(child.signal.aborted).toBe(true)
        // reason should be forwarded
        expect(reasons.length).toBeGreaterThan(0)
        expect(reasons[0]).toBe('parent-reason')
    })

    test('returns no-op controller when parent already aborted', () => {
        const parent = new AbortController()
        parent.abort('already')

        const child = aborts.timeout(1000, parent.signal)
        expect(child.signal.aborted).toBe(true)
        expect(child.signal.reason).toBe('already')
        // calling abort on the returned controller should be a no-op and not throw
        child.abort('another')
        expect(child.signal.reason).toBe('already')
    })

    test('explicit abort before timeout', async () => {
        const controller = aborts.timeout(500)
        expect(controller.signal.aborted).toBe(false)

        const reasons: any[] = []
        controller.signal.addEventListener('abort', (ev: any) => reasons.push(ev.target.reason))
        controller.abort('manual-abort')

        // allow microtask queue
        await Promise.resolve()
        expect(controller.signal.aborted).toBe(true)
        expect(reasons.length).toBeGreaterThan(0)
        expect(reasons[0]).toBe('manual-abort')
        await delay(600)
        // should not change after timeout
        expect(controller.signal.aborted).toBe(true)
        expect(reasons.length).toBe(1)
        expect(reasons[0]).toBe('manual-abort')
    })

    test('long timeout', async () => {
        const nativeTimeoutError = await getNativeTimeoutError()

        jest.useFakeTimers();

        const longTimeoutMs = 2 ** 31 - 1 + 5000 // 300 hours
        const controller = aborts.timeout(longTimeoutMs)
        expect(controller.signal.aborted).toBe(false)

        const reasons: any[] = []
        controller.signal.addEventListener('abort', (ev: any) => reasons.push(ev.target.reason))
        // Fast-forward time
        jest.advanceTimersByTime(longTimeoutMs / 2)
        expect(controller.signal.aborted).toBe(false)

        jest.advanceTimersByTime(longTimeoutMs / 2 + 1)

        // allow microtask queue
        await Promise.resolve()
        expect(controller.signal.aborted).toBe(true)
        expect(reasons.length).toBeGreaterThan(0)
        expect(reasons[0]).toEqual(nativeTimeoutError)
    })

    test('cancel long timeout at the middle', async () => {
        jest.useFakeTimers();

        const longTimeoutMs = 2 ** 31 - 1 + 5000 // 300 hours
        const controller = aborts.timeout(longTimeoutMs)
        expect(controller.signal.aborted).toBe(false)

        const reasons: any[] = []
        controller.signal.addEventListener('abort', (ev: any) => reasons.push(ev.target.reason))
        // Fast-forward time
        jest.advanceTimersByTime(longTimeoutMs / 2)
        expect(controller.signal.aborted).toBe(false)
        controller.abort('manual-abort')
        await Promise.resolve()
        expect(controller.signal.aborted).toBe(true)
        expect(reasons.length).toBeGreaterThan(0)
        expect(reasons[0]).toBe('manual-abort')

        jest.advanceTimersByTime(longTimeoutMs / 2 + 1)
        // allow microtask queue
        await Promise.resolve()
        expect(controller.signal.aborted).toBe(true)
        expect(reasons.length).toBe(1)
        expect(reasons[0]).toBe('manual-abort')
    })

    test('parent aborts before timeout', async () => {
        const parent = new AbortController()
        const child = aborts.timeout(5000, parent.signal)

        expect(child.signal.aborted).toBe(false)

        const reasons: any[] = []
        child.signal.addEventListener('abort', (ev: any) => reasons.push(ev.target.reason))

        parent.abort('parent-reason')
        // allow microtask queue
        await Promise.resolve()

        expect(child.signal.aborted).toBe(true)
        // reason should be forwarded
        expect(reasons.length).toBeGreaterThan(0)
        expect(reasons[0]).toBe('parent-reason')
    })

    test('parent is not aborted', async () => {
        const parent = new AbortController()
        const child = aborts.timeout(5000, parent.signal)

        expect(child.signal.aborted).toBe(false)
        expect(parent.signal.aborted).toBe(false)

        child.abort('child-abort')
        expect(child.signal.aborted).toBe(true)
        expect(child.signal.reason).toBe('child-abort')
        expect(parent.signal.aborted).toBe(false)
    })

    test('is compatible with native AbortController', async () => {
        const parent = new AbortController()
        expect(parent).toBeInstanceOf(AbortController)
        parent.abort('parent-abort')
        const child = aborts.timeout(0, parent.signal)

        expect(child).toBeInstanceOf(AbortController)
    })

    test('is disposable', async () => {
        let ac: AbortController|undefined
        (() => {
            using ac2 = aborts.timeout(5000)
            ac = ac2
            expect(ac2.signal.aborted).toBe(false)
        })()
        expect(ac?.signal.aborted).toBe(true)
    })
})