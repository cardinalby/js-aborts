function noOp() {}

const MAX_TIMEOUT = 2 ** 31 - 1 // max safe 32bit timeout, ~24.8 days

// returns timeout cancel function
function setLongTimeout(
    callback: () => void,
    timeoutMs: number
): () => void {
    if (timeoutMs <= 0) {
        callback()
        return noOp
    }

    let timeoutId: any = null

    const scheduleNext = () => {
        const chunk = Math.min(timeoutMs, MAX_TIMEOUT)
        timeoutMs -= chunk
        timeoutId = setTimeout(() => {
            if (timeoutMs <= 0) {
                callback()
            } else {
                scheduleNext()
            }
        }, chunk)
    }

    scheduleNext()

    return () => {
        if (timeoutId !== null) {
            clearTimeout(timeoutId)
        }
    }
}

function polyfillSymbolDispose() {
    if (typeof Symbol.dispose === 'undefined') {
        (Symbol as any).dispose = Symbol('Symbol.dispose')
    }
}

interface Disposable {
    [Symbol.dispose](): void
}

function createController(): aborts.Controller {
    const ac = new AbortController()
    polyfillSymbolDispose()
    if (!(Symbol.dispose in ac)) {
        (ac as aborts.Controller)[Symbol.dispose] = () => {
            ac.abort()
        }
    }
    return ac as aborts.Controller
}

function createAbortedController(reason: any): aborts.Controller {
    const ac = new AbortController()
    ac.abort(reason)
    polyfillSymbolDispose()
    if (!(Symbol.dispose in ac)) {
        (ac as aborts.Controller)[Symbol.dispose] = noOp
    }
    return ac as aborts.Controller
}

function createTimeoutError(): Error | DOMException {
    const name = "TimeoutError"
    const message = "The operation was aborted due to timeout"

    if (typeof globalThis?.DOMException === 'function') {
        try {
            return new DOMException(message, name)
        } catch {
            // Some hosts may throw while constructing DOMException; fall back below
        }
    }
    const err = new Error(message)
    err.name = name
    return err
}

export namespace aborts {
    export interface Controller extends AbortController, Disposable {}
    // noinspection JSUnusedGlobalSymbols
    // Just for convenience if someone wants to use only aborts namespace.
    // noinspection JSUnusedGlobalSymbols
    export interface Signal extends AbortSignal {}

    /**
     * Creates a new AbortController
     * If valid parentSignals are provided, abortion any of them also aborts the returned controller.
     * If any parentSignal is already aborted, the returned controller is also already aborted with the reason
     * of the first aborted parentSignal
     */
    export function create(...parentSignals: (AbortSignal|undefined)[]): Controller {
        const parents = parentSignals.filter(s => s) as AbortSignal[]
        for (const parent of parents) {
            if (parent.aborted) {
                return createAbortedController(parent.reason)
            }
        }
        const ac = createController()

        for (const parentSignal of parents) {
            parentSignal?.addEventListener(
                'abort',
                () => ac.abort(parentSignal.reason),
                {
                    signal: ac.signal,
                    once: true,
                },
            )
        }

        return ac
    }

    /**
     * Creates a new AbortController that aborts after the specified timeoutMs.
     * If valid parentSignals are provided, abortion any of them also aborts the returned controller.
     * If any parentSignal is already aborted, the returned controller is also already aborted with the reason
     * of the first aborted parentSignal
     */
    export function timeout(timeoutMs: number, ...parentSignals: (AbortSignal|undefined)[]): Controller {
        const ac = create(...parentSignals)
        if (ac.signal.aborted) {
            return ac
        }

        const clearLongTimeout = setLongTimeout(
            () => ac.abort(createTimeoutError()),
            timeoutMs
        )
        ac.signal.addEventListener(
            'abort',
            clearLongTimeout,
            { once: true }
        )

        return ac
    }
}

