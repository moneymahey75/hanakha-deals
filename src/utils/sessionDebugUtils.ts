// Quiet compatibility utilities. Session debug logging was removed to avoid
// exposing user IDs, admin-session state, or session-storage details.
export const sessionDebugUtils = {
    logSessionStatus: () => {},
    clearAllSessionsDebug: () => {},
    testSessionRestore: async () => null,
    validateSessionStorage: () => {},
    setupDebugCommands: () => {}
};

export default sessionDebugUtils;
