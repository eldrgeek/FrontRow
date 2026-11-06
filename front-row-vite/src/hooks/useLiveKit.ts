import { useRef, useCallback } from 'react';
import {
  Room,
  RoomEvent,
  Track,
  LocalVideoTrack,
} from 'livekit-client';

export interface LiveKitHook {
  connectAsPerformer: (livekitUrl: string, tokenUrl: string, identity: string, onAudienceStream?: (identity: string, stream: MediaStream | null) => void) => Promise<MediaStream | null>;
  /** onAudienceStream: other guests' seat cameras (the house sees each other). */
  connectAsAudience: (livekitUrl: string, tokenUrl: string, identity: string, onPerformerStream: (stream: MediaStream | null) => void, localStream?: MediaStream, onAudienceStream?: (identity: string, stream: MediaStream | null) => void) => Promise<void>;
  disconnect: () => Promise<void>;
  getLocalStream: () => MediaStream | null;
}

/** livekitRoom: the house's LiveKit room (src/lib/roomScope.ts livekitRoomFor). */
export function useLiveKit(livekitRoom: string = 'frontrow-main'): LiveKitHook {
  const roomRef = useRef<Room | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  // Read at call time: the connect callbacks below are memoized.
  const livekitRoomRef = useRef(livekitRoom);
  livekitRoomRef.current = livekitRoom;

  const getToken = async (tokenUrl: string, identity: string, role: 'performer' | 'audience'): Promise<string> => {
    const url = `${tokenUrl}?identity=${encodeURIComponent(identity)}&role=${role}&room=${encodeURIComponent(livekitRoomRef.current)}`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Token fetch failed: ${response.statusText}`);
    }
    const data = await response.json();
    if (!data.token) {
      throw new Error('No token in response');
    }
    return data.token;
  };

  const connectAsPerformer = useCallback(async (livekitUrl: string, tokenUrl: string, identity: string, onAudienceStream?: (identity: string, stream: MediaStream | null) => void): Promise<MediaStream | null> => {
    try {
      if (roomRef.current) {
        await roomRef.current.disconnect();
      }

      const token = await getToken(tokenUrl, 'performer', 'performer');

      const room = new Room({
        adaptiveStream: true,
        dynacast: true,
      });
      roomRef.current = room;

      await room.connect(livekitUrl, token);
      console.log('🎭 LiveKit: Performer connected to room');

      if (onAudienceStream) {
        room.on(RoomEvent.TrackSubscribed, (track, _pub, participant) => {
          if (track.kind === Track.Kind.Video && track.source === Track.Source.Camera) {
            const stream = new MediaStream([track.mediaStreamTrack]);
            const audioPublication = participant.getTrackPublication(Track.Source.Microphone);
            if (audioPublication?.track?.mediaStreamTrack) {
              stream.addTrack(audioPublication.track.mediaStreamTrack);
            }
            console.log(`🎭 LiveKit: Audience stream received from ${participant.identity}`);
            onAudienceStream(participant.identity, stream);
          }
        });
        room.on(RoomEvent.TrackUnsubscribed, (track, _pub, participant) => {
          if (track.kind === Track.Kind.Video) {
            onAudienceStream(participant.identity, null);
          }
        });
        room.remoteParticipants.forEach((participant) => {
          participant.trackPublications.forEach((publication) => {
            if (!publication.isSubscribed) publication.setSubscribed(true);
            if (publication.track && publication.kind === Track.Kind.Video && publication.source === Track.Source.Camera) {
              const stream = new MediaStream([publication.track.mediaStreamTrack]);
              onAudienceStream(participant.identity, stream);
            }
          });
        });
      }

      await room.localParticipant.enableCameraAndMicrophone();

      const videoTrack = room.localParticipant.getTrackPublication(Track.Source.Camera)?.track;
      const audioTrack = room.localParticipant.getTrackPublication(Track.Source.Microphone)?.track;

      if (videoTrack && videoTrack.mediaStreamTrack) {
        const tracks: MediaStreamTrack[] = [videoTrack.mediaStreamTrack];
        if (audioTrack && audioTrack.mediaStreamTrack) {
          tracks.push(audioTrack.mediaStreamTrack);
        }
        const stream = new MediaStream(tracks);
        localStreamRef.current = stream;
        console.log('🎭 LiveKit: Local stream created for performer preview');
        return stream;
      }

      return null;
    } catch (err) {
      console.error('LiveKit: Error connecting as performer:', err);
      throw err;
    }
  }, []);

  const connectAsAudience = useCallback(async (
    livekitUrl: string,
    tokenUrl: string,
    identity: string,
    onPerformerStream: (stream: MediaStream | null) => void,
    localStream?: MediaStream,
    onAudienceStream?: (identity: string, stream: MediaStream | null) => void
  ): Promise<void> => {
    try {
      if (roomRef.current) {
        await roomRef.current.disconnect();
      }

      const token = await getToken(tokenUrl, identity, 'audience');

      const room = new Room({
        adaptiveStream: true,
        dynacast: true,
      });
      roomRef.current = room;

      room.on(RoomEvent.TrackSubscribed, (track, _publication, participant) => {
        console.log(`🎬 LiveKit: Track subscribed from ${participant.identity}: ${track.kind}`);
        if (track.kind === Track.Kind.Video && track.source === Track.Source.Camera &&
            participant.identity === 'performer') {
          const stream = new MediaStream([track.mediaStreamTrack]);
          const audioPublication = participant.getTrackPublication(Track.Source.Microphone);
          if (audioPublication?.track?.mediaStreamTrack) {
            stream.addTrack(audioPublication.track.mediaStreamTrack);
          }
          console.log('🎬 LiveKit: Setting performer stream from LiveKit track');
          onPerformerStream(stream);
        } else if (onAudienceStream && track.kind === Track.Kind.Video && track.source === Track.Source.Camera) {
          onAudienceStream(participant.identity, new MediaStream([track.mediaStreamTrack]));
        }
      });

      room.on(RoomEvent.TrackUnsubscribed, (track, _publication, participant) => {
        console.log(`🎬 LiveKit: Track unsubscribed from ${participant.identity}`);
        if (track.kind === Track.Kind.Video && participant.identity === 'performer') {
          onPerformerStream(null);
        } else if (onAudienceStream && track.kind === Track.Kind.Video) {
          onAudienceStream(participant.identity, null);
        }
      });

      room.on(RoomEvent.ParticipantDisconnected, (participant) => {
        console.log(`🎬 LiveKit: Participant disconnected: ${participant.identity}`);
      });

      await room.connect(livekitUrl, token);
      console.log('🎬 LiveKit: Audience connected to room');

      // Publish audience camera if available
      if (localStream) {
        const videoTrack = localStream.getVideoTracks()[0];
        if (videoTrack) {
          const lkVideoTrack = new LocalVideoTrack(videoTrack);
          await room.localParticipant.publishTrack(lkVideoTrack, { source: Track.Source.Camera });
          console.log('🎬 LiveKit: Audience camera published');
        }
      }

      // Check for already-publishing participants (performer already live)
      room.remoteParticipants.forEach((participant) => {
        participant.trackPublications.forEach((publication) => {
          // Force subscribe if not already subscribed
          if (!publication.isSubscribed) {
            publication.setSubscribed(true);
          }
          // Use track if already available
          if (publication.track && publication.kind === Track.Kind.Video &&
              publication.source === Track.Source.Camera &&
              participant.identity === 'performer') {
            const stream = new MediaStream([publication.track.mediaStreamTrack]);
            const audioPublication = participant.getTrackPublication(Track.Source.Microphone);
            if (audioPublication?.track?.mediaStreamTrack) {
              stream.addTrack(audioPublication.track.mediaStreamTrack);
            }
            console.log('🎬 LiveKit: Found existing performer stream on connect');
            onPerformerStream(stream);
          } else if (onAudienceStream && publication.track && publication.kind === Track.Kind.Video &&
              publication.source === Track.Source.Camera) {
            onAudienceStream(participant.identity, new MediaStream([publication.track.mediaStreamTrack]));
          }
        });
      });

    } catch (err) {
      console.error('LiveKit: Error connecting as audience:', err);
      throw err;
    }
  }, []);

  const disconnect = useCallback(async (): Promise<void> => {
    if (roomRef.current) {
      await roomRef.current.disconnect();
      roomRef.current = null;
    }
    localStreamRef.current = null;
  }, []);

  const getLocalStream = useCallback((): MediaStream | null => {
    return localStreamRef.current;
  }, []);

  return { connectAsPerformer, connectAsAudience, disconnect, getLocalStream };
}
