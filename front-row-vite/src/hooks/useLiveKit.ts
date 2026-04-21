import { useRef, useCallback } from 'react';
import {
  Room,
  RoomEvent,
  Track,
  LocalVideoTrack,
} from 'livekit-client';

export interface LiveKitHook {
  connectAsPerformer: (livekitUrl: string, tokenUrl: string, identity: string) => Promise<MediaStream | null>;
  connectAsAudience: (livekitUrl: string, tokenUrl: string, identity: string, onPerformerStream: (stream: MediaStream | null) => void, localStream?: MediaStream) => Promise<void>;
  disconnect: () => Promise<void>;
  getLocalStream: () => MediaStream | null;
}

export function useLiveKit(): LiveKitHook {
  const roomRef = useRef<Room | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);

  const getToken = async (tokenUrl: string, identity: string, role: 'performer' | 'audience'): Promise<string> => {
    const url = `${tokenUrl}?identity=${encodeURIComponent(identity)}&role=${role}&room=frontrow-main`;
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

  const connectAsPerformer = useCallback(async (livekitUrl: string, tokenUrl: string, identity: string): Promise<MediaStream | null> => {
    try {
      if (roomRef.current) {
        await roomRef.current.disconnect();
      }

      const token = await getToken(tokenUrl, identity, 'performer');

      const room = new Room({
        adaptiveStream: true,
        dynacast: true,
      });
      roomRef.current = room;

      await room.connect(livekitUrl, token);
      console.log('🎭 LiveKit: Performer connected to room');

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
    localStream?: MediaStream
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
        if (track.kind === Track.Kind.Video && track.source === Track.Source.Camera) {
          const stream = new MediaStream([track.mediaStreamTrack]);
          const audioPublication = participant.getTrackPublication(Track.Source.Microphone);
          if (audioPublication?.track?.mediaStreamTrack) {
            stream.addTrack(audioPublication.track.mediaStreamTrack);
          }
          console.log('🎬 LiveKit: Setting performer stream from LiveKit track');
          onPerformerStream(stream);
        }
      });

      room.on(RoomEvent.TrackUnsubscribed, (track, _publication, participant) => {
        console.log(`🎬 LiveKit: Track unsubscribed from ${participant.identity}`);
        if (track.kind === Track.Kind.Video) {
          onPerformerStream(null);
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
              publication.source === Track.Source.Camera) {
            const stream = new MediaStream([publication.track.mediaStreamTrack]);
            const audioPublication = participant.getTrackPublication(Track.Source.Microphone);
            if (audioPublication?.track?.mediaStreamTrack) {
              stream.addTrack(audioPublication.track.mediaStreamTrack);
            }
            console.log('🎬 LiveKit: Found existing performer stream on connect');
            onPerformerStream(stream);
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
