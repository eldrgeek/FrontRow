# Question Modal Functionality

The modal dialog now supports asking users questions and receiving responses. This feature allows the requesting endpoint to interactively get user input through the modal interface.

## Features

- **Question Display**: Shows the question clearly in the modal
- **Text Input**: Users can type their response in a text field
- **Submit Options**: Users can submit by pressing ENTER or clicking the Send button
- **Response Tracking**: Each question has a unique ID for tracking responses
- **Auto-focus**: Input field is automatically focused when question appears
- **Validation**: Submit button is disabled until user enters text
- **Success Feedback**: Shows confirmation when response is sent

## Usage

### Sending a Question

To ask a user a question, send a `modal-update` event with the `question` action:

```javascript
socket.emit('modal-update', {
  action: 'question',
  question: 'What is your favorite color?',
  questionId: 'unique-question-id',
  priority: 'info',
  icon: 'question'
});
```

### Parameters

- `action`: Must be `'question'`
- `question`: The question text to display
- `questionId`: Unique identifier for tracking the response
- `priority`: Optional priority level ('info', 'warning', 'error', 'success')
- `icon`: Optional icon to display (defaults to priority-based icon)

### Receiving Responses

Listen for the `question-response` event to receive user responses:

```javascript
socket.on('question-response', (data) => {
  console.log('Question ID:', data.questionId);
  console.log('Response:', data.response);
  console.log('Timestamp:', data.timestamp);
});
```

### Response Data Structure

```javascript
{
  questionId: 'unique-question-id',
  response: 'User typed response',
  timestamp: '2024-01-01T12:00:00.000Z'
}
```

## UI Behavior

1. **Question Display**: The question appears in the modal with a clear label
2. **Input Field**: Text input is automatically focused
3. **Submit Options**: 
   - Press ENTER to submit
   - Click "Send" button to submit
4. **Validation**: Send button is disabled until text is entered
5. **Success Feedback**: Shows "Response sent successfully" message
6. **Auto-hide**: Modal automatically hides after 2 seconds

## Example Implementation

See `test-question-modal.js` for a complete example of how to use this functionality.

## Styling

The question input uses the same styling as other modal components:
- Semi-transparent background
- Consistent with modal theme
- Responsive design
- Keyboard navigation support

## Integration with Existing Features

The question functionality integrates seamlessly with existing modal features:
- Maintains connection status indicators
- Works with drag-and-drop positioning
- Preserves window state persistence
- Compatible with all existing modal actions 