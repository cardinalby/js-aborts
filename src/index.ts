function noOp() {}

// returns timeout cancel function
function setLongTimeout(
    callback: () => void,
    timeoutMs: number
): () => void {
    const MAX_TIMEOUT = 2 ** 31 - 1 // max safe 32bit timeout, ~24.8 days

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

function createController(): aborts.Controller {
    const ac = new AbortController()
    if (typeof Symbol.dispose !== 'undefined' && !(Symbol.dispose in ac)) {
        (ac as aborts.Controller)[Symbol.dispose] = () => {
            ac.abort()
        }
    }
    return ac as aborts.Controller
}

function createAbortedController(reason: any): aborts.Controller {
    const ac = new AbortController()
    ac.abort(reason)
    if (typeof Symbol.dispose !== 'undefined' && !(Symbol.dispose in ac)) {
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
     * If parentSignal is provided, abortion of the parentSignal also aborts the returned controller.
     * If the parentSignal is already aborted, the returned controller is also already aborted.
     * Aborting the returned controller does not abort the parent.
     */
    export function create(parentSignal?: AbortSignal): Controller {
        if (parentSignal?.aborted) {
            return createAbortedController(parentSignal.reason)
        }
        const ac = createController()

        parentSignal?.addEventListener(
            'abort',
            () => ac.abort(parentSignal.reason),
            {
                signal: ac.signal,
                once: true,
            },
        )

        return ac
    }

    /**
     * Creates a new AbortController that aborts (with reason = deadlineExceeded) after the specified timeoutMs.
     * If parentSignal is provided, abortion of the parentSignal also aborts the returned controller.
     * If the parentSignal is already aborted, the returned controller is also already aborted.
     * Aborting the returned controller does not abort the parent
     */
    export function timeout(timeoutMs: number, parentSignal?: AbortSignal): Controller {
        const ac = create(parentSignal)
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

