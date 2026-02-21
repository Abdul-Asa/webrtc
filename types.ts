export type Member = {
  id: string;
  displayName: string;
  joinedAt: string;
  lastSeenAt: string;
};

export type MemberSnapshot = {
  id: string;
  displayName: string;
  joinedAt: string;
  lastSeenAt: string;
  online: boolean;
};

export type Room = {
  code: string;
  createdAt: string;
  members: Map<string, Member>;
};

export type SocketSession = {
  roomCode: string;
  memberId: string;
};

export type SocketStatus = "disconnected" | "connecting" | "connected";

export type RoomMember = MemberSnapshot;

export type CreateRoomResponse = {
  roomCode: string;
  createdAt: string;
};

export type JoinRoomResponse = {
  roomCode: string;
  member: RoomMember;
  wsPath: string;
};

export type ServerEvent =
  | {
      type: "room:state";
      roomCode: string;
      members: MemberSnapshot[];
    }
  | {
      type: "member:joined";
      member: MemberSnapshot;
    }
  | {
      type: "member:left";
      member: MemberSnapshot;
    }
  | {
      type: "presence:pong";
      at: string;
    }
  | {
      type: "error";
      message: string;
    };
