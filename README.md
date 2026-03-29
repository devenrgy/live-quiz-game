# Live Quiz Game — WebSocket Backend

Real-time multiplayer quiz game server built with Node.js and WebSocket.

## Installation

```bash
npm install
```

## Start Server

```bash
npm run start
```

Server starts on port `8080` by default.

## WebSocket Protocol

All messages are JSON strings with the following structure:

```json
{
  "type": "message_type",
  "data": { ... },
  "id": 0
}
```

## Commands

### Player Registration

**Request:**
```json
{ "type": "reg", "data": { "name": "Player1", "password": "secret" }, "id": 0 }
```

**Response (success):**
```json
{ "type": "reg", "data": { "name": "Player1", "index": "uuid", "error": false, "errorText": "" }, "id": 0 }
```

**Response (error):**
```json
{ "type": "reg", "data": { "name": "", "index": "", "error": true, "errorText": "Password mismatch" }, "id": 0 }
```

---

### Create Game

**Request:**
```json
{
  "type": "create_game",
  "data": {
    "questions": [
      {
        "text": "What is 2+2?",
        "options": ["3", "4", "5", "6"],
        "correctIndex": 1,
        "timeLimitSec": 30
      }
    ]
  },
  "id": 0
}
```

**Response:**
```json
{ "type": "create_game", "data": { "gameId": "uuid", "code": "ABC123" }, "id": 0 }
```

---

### Join Game

**Request:**
```json
{ "type": "join_game", "data": { "code": "ABC123" }, "id": 0 }
```

**Response:**
```json
{ "type": "join_game", "data": { "gameId": "uuid" }, "id": 0 }
```

**Broadcast to all players:**
```json
{ "type": "player_joined", "data": { "playerName": "Player2", "playerCount": 2 }, "id": 0 }
{ "type": "update_players", "data": { "players": [{ "name": "Player1", "index": "uuid1", "score": 0 }, { "name": "Player2", "index": "uuid2", "score": 0 }] }, "id": 0 }
```

---

### Start Game

**Request:**
```json
{ "type": "start_game", "data": { "gameId": "uuid" }, "id": 0 }
```

**Broadcast:**
```json
{
  "type": "question",
  "data": {
    "questionNumber": 1,
    "totalQuestions": 5,
    "text": "What is 2+2?",
    "options": ["3", "4", "5", "6"],
    "timeLimitSec": 30
  },
  "id": 0
}
```

---

### Submit Answer

**Request:**
```json
{ "type": "answer", "data": { "gameId": "uuid", "questionIndex": 0, "answerIndex": 1 }, "id": 0 }
```

**Response:**
```json
{ "type": "answer_accepted", "data": { "questionIndex": 0 }, "id": 0 }
```

---

### Question Result

**Broadcast:**
```json
{
  "type": "question_result",
  "data": {
    "questionIndex": 0,
    "correctIndex": 1,
    "playerResults": [
      { "name": "Player1", "answered": true, "correct": true, "pointsEarned": 1000, "totalScore": 1000 }
    ]
  },
  "id": 0
}
```

---

### Game Finished

**Broadcast:**
```json
{
  "type": "game_finished",
  "data": {
    "scoreboard": [
      { "name": "Player1", "score": 1000, "rank": 1 },
      { "name": "Player2", "score": 800, "rank": 2 }
    ]
  },
  "id": 0
}
```

---

### Pause Game (Host Only)

**Request:**
```json
{ "type": "pause_game", "data": { "gameId": "uuid" }, "id": 0 }
```

**Broadcast:**
```json
{ "type": "game_paused", "data": {}, "id": 0 }
```

---

### Resume Game (Host Only)

**Request:**
```json
{ "type": "resume_game", "data": { "gameId": "uuid" }, "id": 0 }
```

**Broadcast:**
```json
{ "type": "game_resumed", "data": {}, "id": 0 }
```

---

### Export Questions (Host Only)

**Request:**
```json
{ "type": "export_questions", "data": { "gameId": "uuid" }, "id": 0 }
```

**Response:**
```json
{
  "type": "questions_exported",
  "data": {
    "schemaVersion": 1,
    "questions": [
      {
        "text": "What is 2+2?",
        "options": ["3", "4", "5", "6"],
        "correctIndex": 1,
        "timeLimitSec": 30
      }
    ]
  },
  "id": 0
}
```

---

### Import Questions (Host Only)

**Request:**
```json
{
  "type": "import_questions",
  "data": {
    "gameId": "uuid",
    "questions": [
      {
        "text": "New question?",
        "options": ["A", "B", "C", "D"],
        "correctIndex": 0,
        "timeLimitSec": 20
      }
    ]
  },
  "id": 0
}
```

**Response:**
```json
{ "type": "questions_imported", "data": { "gameId": "uuid", "totalQuestions": 1 }, "id": 0 }
```

---

## Question Format

Each question must have:

- `text`: non-empty string
- `options`: array of exactly 4 non-empty strings
- `correctIndex`: integer 0–3
- `timeLimitSec`: positive integer

## Game Status Values

- `waiting` — players can join
- `in_progress` — game is running
- `finished` — game ended
- `paused` — game is paused

## Scoring

Points for correct answers: `Math.round(1000 * timeRemaining / timeLimitSec)`

- Faster answers = more points
- Maximum: 1000 points per question
- Incorrect or no answer: 0 points
