# Troubleshooting live stream video issues
_Exported on 7/29/2025 at 12:02:06 EDT from Cursor (1.2.4)_

---

**User**

Let's fix one thing at a time. When I click Go Live, the video stops "Live' appears on a white screen but I don't see the stream. These messsages appear over and over


CurvedScreen: hasLiveStream = true videoTexture = VideoTexture {isTexture: true, uuid: '8819d642-6112-4751-9e18-545ced6068a8', name: '', source: Source, mipmaps: Array(0), …}
Stage.tsx:63 Using video aspect ratio: 1.3333333333333333
Stage.tsx:79 Adjusted screen dimensions: 10.666666666666666 x 8
Stage.tsx:55 CurvedScreen: hasLiveStream = true videoTexture = VideoTexture {isTexture: true, uuid: '8819d642-6112-4751-9e18-545ced6068a8', name: '', source: Source, mipmaps: Array(0), …}
Stage.tsx:63 Using video aspect ratio: 1.3333333333333333
Stage.tsx:79 Adjusted screen dimensions: 10.666666666666666 x 8
Stage.tsx:55 CurvedScreen: hasLiveStream = true videoTexture = VideoTexture {isTexture: true, uuid: '8819d642-6112-4751-9e18-545ced6068a8', name: '', source: Source, mipmaps: Array(0), …}
Stage.tsx:63 Using video aspect ratio: 1.3333333333333333
Stage.tsx:79 Adjusted screen dimensions: 10.666666666666666 x 8
Stage.tsx:55 CurvedScreen: hasLiveStream = true videoTexture = VideoTexture {isTexture: true, uuid: '8819d642-6112-4751-9e18-545ced6068a8', name: '', source: Source, mipmaps: Array(0), …}
Stage.tsx:63 Using video aspect ratio: 1.3333333333333333
Stage.tsx:79 Adjusted screen dimensions: 10.666666666666666 x 8
Stage.tsx:55 CurvedScreen: hasLiveStream = true videoTexture = VideoTexture {isTexture: true, uuid: '8819d642-6112-4751-9e18-545ced6068a8', name: '', source: Source, mipmaps: Array(0), …}
Stage.tsx:63 Using video aspect ratio: 1.3333333333333333
Stage.tsx:79 Adjusted screen dimensions: 10.666666666666666 x 8
Stage.tsx:55 CurvedScreen: hasLiveStream = true videoTexture = VideoTexture {isTexture: true, uuid: '8819d642-6112-4751-9e18-545ced6068a8', name: '', source: Source, mipmaps: Array(0), …}anisotropy: 1center: _Vector2 {x: 0, y: 0}encoding: 3000flipY: trueformat: 1023generateMipmaps: falseinternalFormat: nullisRenderTargetTexture: falseisTexture: trueisVideoTexture: truemagFilter: 1006mapping: 300matrix: _Matrix3 {elements: Array(9)}matrixAutoUpdate: trueminFilter: 1006mipmaps: []name: ""needsPMREMUpdate: falseoffset: _Vector2 {x: 0, y: 0}onUpdate: nullpremultiplyAlpha: falserepeat: _Vector2 {x: 1, y: 1}rotation: 0source: Source {isSource: true, uuid: '8d081ab3-c54c-4478-aae8-f2be1fea69c9', data: video, version: 1680}type: 1009unpackAlignment: 4userData: {aspectRatio: 1.3333333333333333, originalWidth: 320, originalHeight: 240}uuid: "8819d642-6112-4751-9e18-545ced6068a8"version: 1680wrapS: 1001wrapT: 1001__r3f: {type: 'primitive', previousAttach: null, memoizedProps: {…}, eventCount: 0, root: ƒ, …}id: 12image: (...)[[Prototype]]: _Texture
Stage.tsx:63 Using video aspect ratio: 1.3333333333333333
Stage.tsx:79 Adjusted screen dimensions: 10.666666666666666 x 8

---

**Cursor**

Here's what I've found so far about your "Go Live" issue:

- The Stage and CurvedScreen components are correctly set up to display a live video stream using a Three.js VideoTexture, which is created from the `performerStream` MediaStream.
- The logs you see (`CurvedScreen: hasLiveStream = true ...`) indicate that a VideoTexture is being created and passed to the screen, and the aspect ratio is being calculated and used.
- The App state management shows that `performerStream` is set either when you (as artist) start your camera, or when an audience member receives a WebRTC stream from the artist.

**What could be going wrong:**
- The white screen with "Live" and no video, despite `hasLiveStream = true`, suggests the VideoTexture is being created, but the underlying video element may not be playing, or the video data is not updating.
- The `useVideoTexture` hook creates a hidden video element and attaches the stream, but if the stream is empty, paused, or the video element fails to play, the texture will be blank/white.
- There may be a browser error (permissions, autoplay, CORS, etc.) or a problem with the MediaStream itself.

**Next steps to debug:**
1. Check for browser console errors or warnings (e.g., about video playback, permissions, or WebRTC).
2. Confirm that the MediaStream (`performerStream`) actually contains video tracks and is not ended or muted.
3. Optionally, render the video element (used in `useVideoTexture`) visibly in the DOM for debugging, to see if it plays outside of Three.js.

Would you like to:
- Check for browser errors/warnings and share them here?
- Add a visible video element for debugging?
- Or do you have more details about what you see in the browser console when this happens? 

Let me know how you'd like to proceed!

---

**User**

We had this working earlier so the problem is a regression. Look in ai-chats and see if you can figure out what to do 

---

**Cursor**

Based on the information in `ai-chats/cursor_review_and_correct_llm_generated.md`, here’s what’s relevant to your regression and the "Go Live" video issue:

### Key Observations from the Chat Log

1. **The App, Stage, and useVideoTexture logic**:
   - The `performerStream` is passed from App state to Stage, and then to the `useVideoTexture` hook.
   - The `useVideoTexture` hook creates a hidden video element, attaches the stream, and creates a Three.js VideoTexture.
   - The CurvedScreen component renders the videoTexture if present and showState is 'live'.

2. **Recent changes and refactors**:
   - There was a major migration from Create React App to Vite, and a conversion from JavaScript to TypeScript.
   - There were linter and TypeScript errors, some of which were fixed by removing unused props and imports, and by moving the HTML overlay outside the Canvas.
   - There was a period where the app was not rendering at all due to R3F (React Three Fiber) hooks being used outside the Canvas, which was fixed.

3. **Potential regression points**:
   - In the process of fixing linter errors, some props (like `performerStream`) were removed from components such as Stage and PerformerView, and their usages were commented out or deleted.
   - There was a period where the `useVideoTexture` hook was commented out or replaced with a dummy value (`const videoTexture = null;`) to avoid React hooks rule violations.

### What to Check and Fix

#### 1. **Ensure performerStream is passed to Stage**
   - In the working version, `performerStream` is passed from App to Stage, and Stage uses `useVideoTexture(performerStream)`.
   - If, during linter fixes, you removed `performerStream` from Stage or stopped calling `useVideoTexture`, the live video will never appear, even if the stream is present.

#### 2. **Always call useVideoTexture, but with null/undefined if no stream**
   - The correct pattern is:
     ```ts
     const videoTexture = useVideoTexture(performerStream || null);
     ```
   - Never call hooks conditionally, but always call them with the current value (even if null).

#### 3. **Check that CurvedScreen receives the videoTexture**
   - CurvedScreen should receive the `videoTexture` prop and use it to render the live video.

#### 4. **Check for any code that sets videoTexture to null or disables the video**
   - If you see code like `const videoTexture = null;` in Stage, that’s a regression and should be reverted.

#### 5. **Check App.tsx for correct prop passing**
   - In App.tsx, make sure you have:
     ```tsx
     <Stage
       config={config}
       showState={showState}
       fallbackVideoUrl="https://youtu.be/K6ZeroIZd5g"
       performerStream={performerStream}
       countdownTime={countdownTime}
       isCountdownActive={isCountdownActive}
       isArtist={isPerformer()}
     />
     ```

#### 6. **Check for any errors in useVideoTexture**
   - If the video element is not being created or the stream is not attached, the texture will be blank.

---

## **Action Plan**

1. **Restore performerStream prop and useVideoTexture logic in Stage.tsx**:
   - Make sure Stage receives `performerStream` and calls `useVideoTexture(performerStream || null)`.

2. **Restore prop passing in App.tsx**:
   - Ensure `<Stage ... performerStream={performerStream} ... />` is present.

3. **Check CurvedScreen for correct videoTexture usage**:
   - It should use the `videoTexture` prop to render the live video.

4. **Test the Go Live flow**:
   - After these changes, clicking Go Live should show the live video on the stage.

---

## **Summary Table**

| File           | What to Check/Restore                          |
|----------------|-----------------------------------------------|
| App.tsx        | Pass `performerStream` to Stage               |
| Stage.tsx      | Accept `performerStream` prop, call `useVideoTexture(performerStream || null)` |
| CurvedScreen.tsx | Use `videoTexture` prop for live video      |
| useVideoTexture.ts | No changes needed if above is correct      |

---

**This regression is almost certainly due to the removal or disabling of the `performerStream` prop and/or the `useVideoTexture` hook in Stage.tsx during linter or TypeScript fixes.**

Would you like me to generate the exact code changes to restore this logic? If so, please specify if you want the fix in the Vite project (`front-row-vite/src/components/Stage.tsx` and `App.tsx`).

```typescript
     const videoTexture = useVideoTexture(performerStream || null);
```

```typescriptreact
     <Stage
       config={config}
       showState={showState}
       fallbackVideoUrl="https://youtu.be/K6ZeroIZd5g"
       performerStream={performerStream}
       countdownTime={countdownTime}
       isCountdownActive={isCountdownActive}
       isArtist={isPerformer()}
     />
```

---

**User**

Yes. Please fix

---

**Cursor**

```typescriptreact
// ... existing code ...
interface StageProps {
  config: {
    artistName: string;
  };
  showState: 'idle' | 'pre-show' | 'live' | 'post-show';
  fallbackVideoUrl?: string;
  screenPosition?: [number,number,number];
  performerStream?: MediaStream | null;
  countdownTime?: number;
  isCountdownActive?: boolean;
  isArtist?: boolean;
}
// ... existing code ...
function Stage({ config, showState, fallbackVideoUrl = "https://youtu.be/K6ZeroIZd5g", screenPosition=[0,3.5,-12], performerStream, countdownTime = 0, isCountdownActive = false, isArtist = false }: StageProps): JSX.Element {
  const stageRef = useRef<THREE.Group>(null);
  const [transition, setTransition] = useState(0); // 0 = YouTube, 1 = Stream
  const [prevShowState, setPrevShowState] = useState(showState);
  const [applauseStarted, setApplauseStarted] = useState(false);
  const applauseRef = useRef<HTMLAudioElement>(null);
  const [streamTransition, setStreamTransition] = useState(0); // 0 = hidden, 1 = visible
  const prevVideoTexture = useRef<any>(null);

  // Create a video texture from the performer stream
  const videoTexture = useVideoTexture(performerStream || null);
// ... existing code ...
      <CurvedScreen 
        videoTexture={videoTexture} 
        fallbackVideoId={fallbackVideoUrl} 
        screenPosition={screenPosition} 
        showState={showState} 
        // Animation props for YouTube
        ytOpacity={ytOpacity}
        ytScale={ytScale}
        // Animation props for stream
        streamOpacity={streamOpacity}
        streamScale={streamScale}
        muted={isArtist}
      />
// ... existing code ...
```

```typescriptreact
// ... existing code ...
            <Stage 
              config={config} 
              showState={showState} 
              fallbackVideoUrl="https://youtu.be/K6ZeroIZd5g" 
              performerStream={performerStream} 
              countdownTime={countdownTime} 
              isCountdownActive={isCountdownActive} 
              isArtist={isPerformer()} 
            />
// ... existing code ...
```

Both `Stage.tsx` and `App.tsx` are already correctly passing and using the `performerStream` prop, and `useVideoTexture` is being called as expected. This means the regression is not due to missing prop passing or hook usage.

**However, if you are still not seeing the live video after clicking "Go Live", the issue may be:**
- The `performerStream` is not being set correctly in App state.
- The stream is not valid (e.g., no video tracks, or tracks are ended).
- There is a problem with the WebRTC connection or permissions.

### Next Steps

1. **Add Debug Logging to Confirm Stream Validity**
   - Log the `performerStream` in `App.tsx` right before passing it to `Stage`.
   - Log inside `useVideoTexture` to confirm the stream is received and has video tracks.

2. **Add a Visible Video Element for Debugging**
   - Temporarily render a `<video>` element in the DOM with `srcObject={performerStream}` to see if the stream is valid and playing.

Would you like me to add these debug steps to help pinpoint the issue? This will help determine if the problem is with the stream itself or with the Three.js rendering.

