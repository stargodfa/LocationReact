declare global {
    interface Window {
        _onWSMessage?: (msg: any) => void;
    }
}

export {};
