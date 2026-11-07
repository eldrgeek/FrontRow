import { useRef, useCallback } from 'react';
import {
  Room,
  RoomEvent,
  RemoteParticipant,
  Track,
  LocalVideoTrack,
} from 'livekit-client';
import { getTicketCode, tokenRequestHeaders, reportTicketRefusal, TICKET_FALLBACK_REASONS, isPerformerIdentity } from '../lib/ticketPass';

/** The track name a second performer camera publishes under (src/theater/StageCamera.tsx). */
export const STAGE_CAMERA_TRACK = 'stage';

/** A performer camera published as the stage figure's feed, not the big screen's. */
export function isStageCameraTrack(name: string | undefined): boolean {
  return name === STAGE_CAMERA_TRACK;
}

export interface LiveKitHook {
  connectAsPerformer: (livekitUrl: string, tokenUrl: string, identity: string, onAudienceStream?: (identity: string, stream: MediaStream | null) => void, onStageCamera?: (stream: MediaStream | null) => void) => Promise<MediaStream | null>;
  /** onAudienceStream: other guests' seat cameras (the house sees each other). */
  /** onStageCamera: a performer's second camera (a phone on the boards), for the stage figure. */
  connectAsAudience: (livekitUrl: string, tokenUrl: string, identity: string, onPerformerStream: (stream: MediaStream | null) => void, localStream?: MediaStream, onAudienceStream?: (identity: string, stream: MediaStream | null) => void, onStageCamera?: (stream: MediaStream | null) => void) => Promise<void>;
  /** A phone (or any second camera) on the boards: publishes video only, as the 'stage' track. */
  connectAsStageCamera: (livekitUrl: string, tokenUrl: string, stream: MediaStream) => Promise<void>;
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

  // A ticket, if the guest has one, sets the role; a performer needs a
  // performer ticket or a FrontRow admin sign-in (server/tickets.mjs).
  // cam: a performer's second device ('stage'), so it joins beside the first
  // instead of replacing it (the server gives it its own identity).
  const getToken = async (tokenUrl: string, identity: string, role: 'performer' | 'audience', cam?: string): Promise<string> => {
    const url = `${tokenUrl}?identity=${encodeURIComponent(identity)}&role=${role}&room=${encodeURIComponent(livekitRoomRef.current)}${cam ? `&cam=${encodeURIComponent(cam)}` : ''}`;
    const hadTicket = !!getTicketCode();
    let response = await fetch(url, { headers: await tokenRequestHeaders() });
    if (response.status === 403 && hadTicket) {
      const refusal = await response.clone().json().catch(() => ({}));
      // The guest is always told why their ticket did not open the door.
      reportTicketRefusal(refusal.reason || 'unknown', refusal.validFrom);
      // A ticket that has lapsed (closed, used up, not open yet, another room)
      // still leaves the house open to them if the theater is open. A revoked
      // ticket does not fall back: whoever revoked it meant it.
      if (role === 'audience' && TICKET_FALLBACK_REASONS.includes(refusal.reason)) {
        response = await fetch(url, { headers: await tokenRequestHeaders(false) });
      }
    }
    if (!response.ok) {
      throw new Error(`Token fetch failed: ${response.statusText}`);
    }
    const data = await response.json();
    if (!data.token) {
      throw new Error('No token in response');
    }
    return data.token;
  };

  const connectAsPerformer = useCallback(async (livekitUrl: string, tokenUrl: string, identity: string, onAudienceStream?: (identity: string, stream: MediaStream | null) => void, onStageCamera?: (stream: MediaStream | null) => void): Promise<MediaStream | null> => {
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

      if (onStageCamera) {
        // The performer's own phone on the boards: shown in the green room.
        room.on(RoomEvent.TrackSubscribed, (track, pub, participant) => {
          if (track.kind === Track.Kind.Video && isPerformerIdentity(participant.identity) && isStageCameraTrack(pub.trackName)) {
            onStageCamera(new MediaStream([track.mediaStreamTrack]));
          }
        });
        room.on(RoomEvent.TrackUnsubscribed, (track, pub, participant) => {
          if (track.kind === Track.Kind.Video && isPerformerIdentity(participant.identity) && isStageCameraTrack(pub.trackName)) {
            onStageCamera(null);
          }
        });
        room.remoteParticipants.forEach((participant) => {
          participant.trackPublications.forEach((pub) => {
            if (pub.track && pub.kind === Track.Kind.Video && isPerformerIdentity(participant.identity) && isStageCameraTrack(pub.trackName)) {
              onStageCamera(new MediaStream([pub.track.mediaStreamTrack]));
            }
          });
        });
      }

      if (onAudienceStream) {
        room.on(RoomEvent.TrackSubscribed, (track, _pub, participant) => {
          if (track.kind === Track.Kind.Video && track.source === Track.Source.Camera && !isPerformerIdentity(participant.identity)) {
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
          if (track.kind === Track.Kind.Video && !isPerformerIdentity(participant.identity)) {
            onAudienceStream(participant.identity, null);
          }
        });
        room.remoteParticipants.forEach((participant) => {
          participant.trackPublications.forEach((publication) => {
            if (!publication.isSubscribed) publication.setSubscribed(true);
            if (publication.track && publication.kind === Track.Kind.Video && publication.source === Track.Source.Camera && !isPerformerIdentity(participant.identity)) {
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
    onAudienceStream?: (identity: string, stream: MediaStream | null) => void,
    onStageCamera?: (stream: MediaStream | null) => void
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

      // Every performer track lands here, in any order: the main camera and
      // mic make the big-screen stream (rebuilt when the mic arrives after the
      // camera, so the house always gets the sound), and a camera named
      // 'stage' (a phone on the boards) feeds the stage figure.
      const performerUpdate = (participant: RemoteParticipant) => {
        let main: MediaStreamTrack | null = null;
        let stage: MediaStreamTrack | null = null;
        let mic: MediaStreamTrack | null = null;
        participant.trackPublications.forEach((pub) => {
          const t = pub.track?.mediaStreamTrack;
          if (!t || !pub.isSubscribed) return;
          if (pub.kind === Track.Kind.Video && isStageCameraTrack(pub.trackName)) stage = t;
          else if (pub.kind === Track.Kind.Video && pub.source === Track.Source.Camera) main = t;
          else if (pub.kind === Track.Kind.Audio && pub.source === Track.Source.Microphone) mic = t;
        });
        if (main || mic) {
          onPerformerStream(new MediaStream([main, mic].filter(Boolean) as MediaStreamTrack[]));
        }
        if (onStageCamera && stage) onStageCamera(new MediaStream([stage]));
        return { main, stage, mic };
      };

      room.on(RoomEvent.TrackSubscribed, (track, _publication, participant) => {
        console.log(`🎬 LiveKit: Track subscribed from ${participant.identity}: ${track.kind}`);
        if (isPerformerIdentity(participant.identity)) {
          performerUpdate(participant);
        } else if (onAudienceStream && track.kind === Track.Kind.Video && track.source === Track.Source.Camera) {
          onAudienceStream(participant.identity, new MediaStream([track.mediaStreamTrack]));
        }
      });

      room.on(RoomEvent.TrackUnsubscribed, (track, publication, participant) => {
        console.log(`🎬 LiveKit: Track unsubscribed from ${participant.identity}`);
        if (isPerformerIdentity(participant.identity)) {
          if (track.kind === Track.Kind.Video && isStageCameraTrack(publication.trackName)) {
            onStageCamera?.(null);
          } else if (track.kind === Track.Kind.Video) {
            onPerformerStream(null);
          }
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

      // Participants already in the room (the performer may be live already).
      room.remoteParticipants.forEach((participant) => {
        participant.trackPublications.forEach((publication) => {
          if (!publication.isSubscribed) publication.setSubscribed(true);
        });
        if (isPerformerIdentity(participant.identity)) {
          performerUpdate(participant);
        } else if (onAudienceStream) {
          const cam = participant.getTrackPublication(Track.Source.Camera);
          if (cam?.track) onAudienceStream(participant.identity, new MediaStream([cam.track.mediaStreamTrack]));
        }
      });

    } catch (err) {
      console.error('LiveKit: Error connecting as audience:', err);
      throw err;
    }
  }, []);

  const connectAsStageCamera = useCallback(async (livekitUrl: string, tokenUrl: string, stream: MediaStream): Promise<void> => {
    if (roomRef.current) await roomRef.current.disconnect();
    const token = await getToken(tokenUrl, 'performer', 'performer', STAGE_CAMERA_TRACK);
    const room = new Room({ adaptiveStream: true, dynacast: true });
    roomRef.current = room;
    await room.connect(livekitUrl, token);
    const video = stream.getVideoTracks()[0];
    if (!video) throw new Error('No camera track');
    // No mic: the main camera carries the sound, and two mics would echo.
    await room.localParticipant.publishTrack(new LocalVideoTrack(video), {
      source: Track.Source.Camera,
      name: STAGE_CAMERA_TRACK,
    });
    localStreamRef.current = stream;
    console.log('📱 LiveKit: stage camera published');
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

  return { connectAsPerformer, connectAsAudience, connectAsStageCamera, disconnect, getLocalStream };
}
