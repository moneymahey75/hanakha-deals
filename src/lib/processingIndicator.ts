type ProcessingState = {
  activeCount: number;
  message: string;
};

type Listener = (state: ProcessingState) => void;

let nextProcessingId = 1;
const activeProcesses = new Map<number, string>();
const listeners = new Set<Listener>();

const getState = (): ProcessingState => ({
  activeCount: activeProcesses.size,
  message: Array.from(activeProcesses.values()).at(-1) || 'Processing...'
});

const emit = () => {
  const state = getState();
  listeners.forEach((listener) => listener(state));
};

export const processingIndicator = {
  start(message = 'Processing...') {
    const id = nextProcessingId++;
    activeProcesses.set(id, message);
    emit();
    return id;
  },

  stop(id: number) {
    if (!activeProcesses.has(id)) return;
    activeProcesses.delete(id);
    emit();
  },

  async track<T>(work: Promise<T> | (() => Promise<T>), message = 'Processing...'): Promise<T> {
    const id = this.start(message);
    try {
      const promise = typeof work === 'function' ? work() : work;
      return await promise;
    } finally {
      this.stop(id);
    }
  },

  subscribe(listener: Listener) {
    listeners.add(listener);
    listener(getState());
    return () => {
      listeners.delete(listener);
    };
  }
};
