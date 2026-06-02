import { Server } from "socket.io";
import type { Server as HttpServer } from "http";

let io: Server;

type LiveDraftAuthor = {
    id?: number | string | null;
    nombre?: string | null;
    imagen?: string | null;
    rol?: string | null;
};

type LiveDraftEntry = Record<string, unknown> & {
    tempId: string;
    minutaId: number | string;
    clientId?: string | null;
    author?: LiveDraftAuthor | null;
    updatedAt: string;
};

type LiveDraftRoom = {
    entries: Map<string, LiveDraftEntry>;
};

export const liveDraftRooms = new Map<string, LiveDraftRoom>();

const getRoomName = (minutaId: number | string) => `minuta_${minutaId}`;

const getDraftRoom = (minutaId: number | string): LiveDraftRoom => {
    const key = String(minutaId);
    if (!liveDraftRooms.has(key)) {
        liveDraftRooms.set(key, { entries: new Map() });
    }
    return liveDraftRooms.get(key)!;
};

const normalizeMinutaId = (value: unknown): number | null => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const normalizeTempId = (value: unknown): string | null => {
    if (typeof value !== "string" || value.trim().length === 0) return null;
    return value.trim();
};

const cleanAuthor = (author: unknown): LiveDraftAuthor | null => {
    if (!author || typeof author !== "object") return null;
    const data = author as LiveDraftAuthor;
    return {
        id: data.id ?? null,
        nombre: data.nombre ?? null,
        imagen: data.imagen ?? null,
        rol: data.rol ?? null,
    };
};

export const initSocket = (httpServer: HttpServer): Server => {
    io = new Server(httpServer, {
        cors: {
            origin: "*",
            methods: ["GET", "POST"],
        },
        transports: ["websocket"], // ← CRÍTICO: omitir polling
        pingTimeout: 60000,
        pingInterval: 25000,
    });

    io.on("connection", (socket) => {
        socket.on("join_room", (userId: number | string) => {
            socket.join(`user_${userId}`);
        });

        socket.on("join_global", () => {
            socket.join("global_updates");
        });

        socket.on("join_minuta", (payload: { minutaId?: number | string; user?: LiveDraftAuthor; clientId?: string } | number | string) => {
            const minutaId = normalizeMinutaId(typeof payload === "object" ? payload?.minutaId : payload);
            if (!minutaId) return;

            const roomName = getRoomName(minutaId);
            socket.join(roomName);

            const room = getDraftRoom(minutaId);
            socket.emit("minuta:drafts_snapshot", {
                minutaId,
                entries: Array.from(room.entries.values()),
            });
        });

        socket.on("leave_minuta", (payload: { minutaId?: number | string } | number | string) => {
            const minutaId = normalizeMinutaId(typeof payload === "object" ? payload?.minutaId : payload);
            if (!minutaId) return;
            socket.leave(getRoomName(minutaId));
        });

        socket.on("minuta:draft_entry_upsert", (payload: { minutaId?: number | string; entry?: Record<string, unknown>; clientId?: string; author?: LiveDraftAuthor }) => {
            const minutaId = normalizeMinutaId(payload?.minutaId);
            const tempId = normalizeTempId(payload?.entry?.tempId);
            if (!minutaId || !tempId || !payload?.entry) return;

            const room = getDraftRoom(minutaId);
            const storedEntry: LiveDraftEntry = {
                ...payload.entry,
                tempId,
                minutaId,
                clientId: payload.clientId ?? (payload.entry.clientId as string | undefined) ?? null,
                author: cleanAuthor(payload.author ?? payload.entry.author),
                updatedAt: new Date().toISOString(),
            };

            room.entries.set(tempId, storedEntry);
            socket.to(getRoomName(minutaId)).emit("minuta:draft_entry_upsert", {
                minutaId,
                entry: storedEntry,
            });
        });

        socket.on("minuta:draft_entry_remove", (payload: { minutaId?: number | string; tempId?: string }) => {
            const minutaId = normalizeMinutaId(payload?.minutaId);
            const tempId = normalizeTempId(payload?.tempId);
            if (!minutaId || !tempId) return;

            getDraftRoom(minutaId).entries.delete(tempId);
            socket.to(getRoomName(minutaId)).emit("minuta:draft_entry_remove", {
                minutaId,
                tempId,
            });
        });

        socket.on("minuta:draft_entries_remove", (payload: { minutaId?: number | string; tempIds?: string[] }) => {
            const minutaId = normalizeMinutaId(payload?.minutaId);
            if (!minutaId || !Array.isArray(payload?.tempIds)) return;

            const tempIds = payload.tempIds.map(normalizeTempId).filter((id): id is string => Boolean(id));
            const room = getDraftRoom(minutaId);
            tempIds.forEach((tempId) => room.entries.delete(tempId));

            socket.to(getRoomName(minutaId)).emit("minuta:draft_entries_remove", {
                minutaId,
                tempIds,
            });
        });

        socket.on("disconnect", () => {});
    });

    return io;
};

export const getIO = (): Server => {
    if (!io) throw new Error("Socket.io no ha sido inicializado.");
    return io;
};
