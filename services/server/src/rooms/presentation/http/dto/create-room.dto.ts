export interface CreateRoomDto {
  title: string;
  timezone: string;
  host: {
    displayName: string;
  };
}
