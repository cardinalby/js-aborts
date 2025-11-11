import { aborts } from './index.js'

// In browser environment, chai and sinon are loaded globally
// In Node environment, they are imported as modules
// @ts-ignore
let expect, sinon;
if (typeof window !== 'undefined') {
    // Browser environment
    // @ts-ignore
    expect = window.expect;
    // @ts-ignore
    sinon = window.sinon;
} else {
    // Node environment
    // @ts-ignore
    const chai = await import('chai');
    expect = chai.expect;
    // @ts-ignore
    const sinonModule = await import('sinon');
    sinon = sinonModule.default;
}

function delay(ms: number): Promise<void> {
    return new Promise<void>(
        res => setTimeout(res, ms),
    )
}

describe('aborts.create', () => {
    it('propagates parent abort to child', async () => {
        const parent = new AbortController()
        const child = aborts.create(parent.signal)

        expect(child.signal.aborted).to.be.false

        const reasons: any[] = []
        child.signal.addEventListener('abort', (ev: any) => reasons.push(ev.target.reason))

        parent.abort('parent-reason')

        // allow microtask queue
        await Promise.resolve()

        expect(child.signal.aborted).to.be.true
        // reason should be forwarded
        expect(reasons.length).to.be.greaterThan(0)
        expect(reasons[0]).to.equal('parent-reason')
        child.abort('another-reason')
        // calling abort again should be no-op
        expect(reasons.length).to.equal(1)
        expect(reasons[0]).to.equal('parent-reason')
    })

    it('multiple parents, first aborted', async () => {
        const parent1 = new AbortController()
        const parent2 = new AbortController()
        const child = aborts.create(parent1.signal, parent2.signal)

        expect(child.signal.aborted).to.be.false

        const reasons: any[] = []
        child.signal.addEventListener('abort', (ev: any) => reasons.push(ev.target.reason))

        parent1.abort('parent1-reason')

        // allow microtask queue
        await Promise.resolve()

        expect(child.signal.aborted).to.be.true
        // reason should be forwarded
        expect(reasons.length).to.be.greaterThan(0)
        expect(reasons[0]).to.equal('parent1-reason')
    })

    it('multiple parents that are already aborted', async () => {
        const parent1 = new AbortController()
        const parent2 = new AbortController()
        parent1.abort('parent1-reason')
        parent2.abort('parent2-reason')
        const child = aborts.create(parent1.signal, parent2.signal)

        expect(child.signal.aborted).to.be.true
        // reason should be from the first aborted parent
        expect(child.signal.reason).to.equal('parent1-reason')
    })

    it('returns no-op controller when parent already aborted', () => {
        const parent = new AbortController()
        parent.abort('already')

        const child = aborts.create(parent.signal)
        expect(child.signal.aborted).to.be.true
        expect(child.signal.reason).to.equal('already')
        // calling abort on the returned controller should be a no-op and not throw
        child.abort('another')
        expect(child.signal.reason).to.equal('already')
    })

    it('undefined parent', async () => {
        const child = aborts.create(undefined)
        expect(child.signal.aborted).to.be.false

        const reasons: any[] = []
        child.signal.addEventListener('abort', (ev: any) => reasons.push(ev.target.reason))

        child.abort('manual-abort')

        // allow microtask queue
        await Promise.resolve()

        expect(child.signal.aborted).to.be.true
        expect(reasons.length).to.be.greaterThan(0)
        expect(reasons[0]).to.equal('manual-abort')
    })

    it('parent is not aborted', () => {
        const parent = new AbortController()
        const child = aborts.create(parent.signal)
        expect(child.signal.aborted).to.be.false
        expect(parent.signal.aborted).to.be.false

        child.abort('child-abort')
        expect(child.signal.aborted).to.be.true
        expect(child.signal.reason).to.equal('child-abort')
        expect(parent.signal.aborted).to.be.false
    })

    it('is compatible with native AbortController', async () => {
        const parent = new AbortController()
        expect(parent).to.be.instanceOf(AbortController)
        parent.abort('parent-abort')
        const child = aborts.create(parent.signal)

        expect(child).to.be.instanceOf(AbortController)
    })

    it('is disposable', async () => {
        let ac: AbortController|undefined
        (() => {
            using ac2 = aborts.create()
            ac = ac2
            expect(ac2.signal.aborted).to.be.false
        })()
        expect(ac?.signal.aborted).to.be.true
    })
})

describe('aborts.timeout', () => {
    const checkIsLikeNativeTimeoutError = (e: any) => {
        // noinspection JSDeprecatedSymbols
        expect(e).to.be.instanceOf(DOMException)
        expect(e.name).to.equal('TimeoutError')
        // noinspection JSDeprecatedSymbols
        expect(e.code).to.equal(DOMException.TIMEOUT_ERR)
    }

    it('aborts after timeout', async () => {
        const timeoutMs = 100
        const controller = aborts.timeout(timeoutMs)
        expect(controller.signal.aborted).to.be.false

        const reasons: any[] = []
        controller.signal.addEventListener('abort', (ev: any) => reasons.push(ev.target.reason))

        await delay(50)

        expect(controller.signal.aborted).to.be.false

        await delay(100)

        expect(controller.signal.aborted).to.be.true
        expect(reasons.length).to.be.greaterThan(0)
        checkIsLikeNativeTimeoutError(reasons[0])

        controller.abort('another-reason')
        // calling abort again should be no-op
        expect(reasons.length).to.equal(1)
        checkIsLikeNativeTimeoutError(reasons[0])
    })

    it('negative timeout', async () => {
        const timeoutMs = -1000
        const controller = aborts.timeout(timeoutMs)
        expect(controller.signal.aborted).to.be.true
        checkIsLikeNativeTimeoutError(controller.signal.reason)
    })

    it('negative timeout with cancelled parent', async () => {
        const parent = new AbortController()
        parent.abort('parent-abort')

        const timeoutMs = -1000
        const controller = aborts.timeout(timeoutMs, parent.signal)
        expect(controller.signal.aborted).to.be.true
        expect(controller.signal.reason).to.equal('parent-abort')
        controller.abort('another-abort')
        expect(controller.signal.reason).to.equal('parent-abort')
    })

    it('undefined parent', async () => {
        const controller = aborts.timeout(1000, undefined)
        expect(controller.signal.aborted).to.be.false

        const reasons: any[] = []
        controller.signal.addEventListener('abort', (ev: any) => reasons.push(ev.target.reason))
        controller.abort('manual-abort')

        // allow microtask queue
        await Promise.resolve()
        expect(controller.signal.aborted).to.be.true
        expect(reasons.length).to.be.greaterThan(0)
        expect(reasons[0]).to.equal('manual-abort')
        await delay(1100)
        // should not change after timeout
        expect(controller.signal.aborted).to.be.true
        expect(reasons.length).to.equal(1)
        expect(reasons[0]).to.equal('manual-abort')
    })

    it('propagates parent abort to child', async () => {
        const parent = new AbortController()
        const child = aborts.timeout(5000, parent.signal)

        expect(child.signal.aborted).to.be.false

        const reasons: any[] = []
        child.signal.addEventListener('abort', (ev: any) => reasons.push(ev.target.reason))

        parent.abort('parent-reason')
        // allow microtask queue
        await Promise.resolve()

        expect(child.signal.aborted).to.be.true
        // reason should be forwarded
        expect(reasons.length).to.be.greaterThan(0)
        expect(reasons[0]).to.equal('parent-reason')
    })

    it('returns no-op controller when parent already aborted', () => {
        const parent = new AbortController()
        parent.abort('already')

        const child = aborts.timeout(1000, parent.signal)
        expect(child.signal.aborted).to.be.true
        expect(child.signal.reason).to.equal('already')
        // calling abort on the returned controller should be a no-op and not throw
        child.abort('another')
        expect(child.signal.reason).to.equal('already')
    })

    it('explicit abort before timeout', async () => {
        const controller = aborts.timeout(500)
        expect(controller.signal.aborted).to.be.false

        const reasons: any[] = []
        controller.signal.addEventListener('abort', (ev: any) => reasons.push(ev.target.reason))
        controller.abort('manual-abort')

        // allow microtask queue
        await Promise.resolve()
        expect(controller.signal.aborted).to.be.true
        expect(reasons.length).to.be.greaterThan(0)
        expect(reasons[0]).to.equal('manual-abort')
        await delay(600)
        // should not change after timeout
        expect(controller.signal.aborted).to.be.true
        expect(reasons.length).to.equal(1)
        expect(reasons[0]).to.equal('manual-abort')
    })

    it('long timeout', async function() {
        this.timeout(10000) // Increase Mocha timeout for this test

        // Use sinon for fake timers in Mocha
        const clock = sinon.useFakeTimers()

        try {
            const longTimeoutMs = 2 ** 31 - 1 + 5000 // 300 hours
            const controller = aborts.timeout(longTimeoutMs)
            expect(controller.signal.aborted).to.be.false

            const reasons: any[] = []
            controller.signal.addEventListener('abort', (ev: any) => reasons.push(ev.target.reason))
            // Fast-forward time
            await clock.tickAsync(longTimeoutMs / 2)
            expect(controller.signal.aborted).to.be.false

            await clock.tickAsync(longTimeoutMs / 2 + 1)

            // allow microtask queue
            await Promise.resolve()
            expect(controller.signal.aborted).to.be.true
            expect(reasons.length).to.be.greaterThan(0)
            checkIsLikeNativeTimeoutError(reasons[0])
        } finally {
            clock.restore()
        }
    })

    it('cancel long timeout at the middle', async function() {
        this.timeout(10000) // Increase Mocha timeout for this test

        const clock = sinon.useFakeTimers()

        try {
            const longTimeoutMs = 2 ** 31 - 1 + 5000 // 300 hours
            const controller = aborts.timeout(longTimeoutMs)
            expect(controller.signal.aborted).to.be.false

            const reasons: any[] = []
            controller.signal.addEventListener('abort', (ev: any) => reasons.push(ev.target.reason))
            // Fast-forward time
            await clock.tickAsync(longTimeoutMs / 2)
            expect(controller.signal.aborted).to.be.false
            controller.abort('manual-abort')
            await Promise.resolve()
            expect(controller.signal.aborted).to.be.true
            expect(reasons.length).to.be.greaterThan(0)
            expect(reasons[0]).to.equal('manual-abort')

            await clock.tickAsync(longTimeoutMs / 2 + 1)
            // allow microtask queue
            await Promise.resolve()
            expect(controller.signal.aborted).to.be.true
            expect(reasons.length).to.equal(1)
            expect(reasons[0]).to.equal('manual-abort')
        } finally {
            clock.restore()
        }
    })

    it('parent aborts before timeout', async () => {
        const parent = new AbortController()
        const child = aborts.timeout(5000, parent.signal)

        expect(child.signal.aborted).to.be.false

        const reasons: any[] = []
        child.signal.addEventListener('abort', (ev: any) => reasons.push(ev.target.reason))

        parent.abort('parent-reason')
        // allow microtask queue
        await Promise.resolve()

        expect(child.signal.aborted).to.be.true
        // reason should be forwarded
        expect(reasons.length).to.be.greaterThan(0)
        expect(reasons[0]).to.equal('parent-reason')
    })

    it('parent is not aborted', async () => {
        const parent = new AbortController()
        const child = aborts.timeout(5000, parent.signal)

        expect(child.signal.aborted).to.be.false
        expect(parent.signal.aborted).to.be.false

        child.abort('child-abort')
        expect(child.signal.aborted).to.be.true
        expect(child.signal.reason).to.equal('child-abort')
        expect(parent.signal.aborted).to.be.false
    })

    it('is compatible with native AbortController', async () => {
        const parent = new AbortController()
        expect(parent).to.be.instanceOf(AbortController)
        parent.abort('parent-abort')
        const child = aborts.timeout(0, parent.signal)

        expect(child).to.be.instanceOf(AbortController)
    })

    it('is disposable', async () => {
        let ac: AbortController|undefined
        (() => {
            using ac2 = aborts.timeout(5000)
            ac = ac2
            expect(ac2.signal.aborted).to.be.false
        })()
        expect(ac?.signal.aborted).to.be.true
    })
})