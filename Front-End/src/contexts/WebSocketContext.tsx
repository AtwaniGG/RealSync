import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { buildWsUrl, getAuthToken } from '../lib/api';

type WsMessageHandler = (message: Record<string, unknown>) => void;

interface WebSocketContextType {
  isConnected: boolean;
  subscribe: (handler: WsMessageHandler) => () => void;
}

const WebSocketContext = createContext<WebSocketContextType | undefined>(undefined);

interface WebSocketProviderProps {
  sessionId: string | null;
  children: import('react').ReactNode;
}

export function WebSocketProvider({ sessionId, children }: WebSocketProviderProps) {
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const handlersRef = useRef<Set<WsMessageHandler>>(new Set());
  const reconnectTimerRef = useRef<number | null>(null);
  // H19: Exponential backoff for reconnect
  const reconnectDelayRef = useRef(1000);
  const MAX_RECONNECT_DELAY = 30000;

  const subscribe = useCallback((handler: WsMessageHandler) => {
    handlersRef.current.add(handler);
    return () => {
      handlersRef.current.delete(handler);
    };
  }, []);

  useEffect(() => {
    let isActive = true;
    // Reset backoff for new sessions so stale delay doesn't carry over
    reconnectDelayRef.current = 1000;

    const cleanup = () => {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.onerror = null;
        wsRef.current.onmessage = null;
        wsRef.current.close();
        wsRef.current = null;
      }
      setIsConnected(false);
    };

    if (!sessionId) {
      cleanup();
      return;
    }

    const subscribePath = `/ws?sessionId=${encodeURIComponent(sessionId)}`;

    const connect = async () => {
      if (!isActive) return;
      cleanup();

      try {
        const ws = new WebSocket(buildWsUrl(subscribePath));
        wsRef.current = ws;

        ws.onopen = async () => {
          if (!isActive) return;
          // Send auth token as first message (existing auth pattern)
          try {
            const token = await getAuthToken();
            if (token && ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'auth', token }));
            }
          } catch {
            // Continue without auth in prototype mode
          }
          if (ws.readyState === WebSocket.OPEN) {
            setIsConnected(true);
          }
          // H19: Reset backoff on successful connect
          reconnectDelayRef.current = 1000;
        };

        ws.onmessage = (event) => {
          if (!isActive) return;
          try {
            const message = JSON.parse(event.data);
            handlersRef.current.forEach((handler) => {
              try {
                handler(message);
              } catch {
                // Isolate handler errors
              }
            });
          } catch {
            // Ignore malformed payloads
          }
        };

        ws.onclose = () => {
          if (!isActive) return;
          setIsConnected(false);
          wsRef.current = null;
          // H19: Exponential backoff reconnect
          const delay = reconnectDelayRef.current;
          reconnectDelayRef.current = Math.min(delay * 2, MAX_RECONNECT_DELAY);
          reconnectTimerRef.current = window.setTimeout(() => {
            if (isActive) connect();
          }, delay);
        };

        ws.onerror = () => {
          if (!isActive) return;
          setIsConnected(false);
        };
      } catch {
        // WebSocket constructor can throw if URL is invalid
        if (isActive) {
          const delay = reconnectDelayRef.current;
          reconnectDelayRef.current = Math.min(delay * 2, MAX_RECONNECT_DELAY);
          reconnectTimerRef.current = window.setTimeout(() => {
            if (isActive) connect();
          }, delay);
        }
      }
    };

    connect();

    return () => {
      isActive = false;
      cleanup();
    };
  }, [sessionId]);

  return (
    <WebSocketContext.Provider value={{ isConnected, subscribe }}>
      {children}
    </WebSocketContext.Provider>
  );
}

export function useWebSocket() {
  const context = useContext(WebSocketContext);
  if (!context) throw new Error('useWebSocket must be used within WebSocketProvider');
  return context;
}

/**
 * Convenience hook: subscribe to all WS messages with a handler.
 * Handler is called for every message; filter by message.type inside.
 */
// H18: Use ref to hold latest handler, preventing resubscription every render
export function useWsMessages(handler: WsMessageHandler) {
  const { subscribe } = useWebSocket();
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    return subscribe((msg) => handlerRef.current(msg));
  }, [subscribe]);
}
