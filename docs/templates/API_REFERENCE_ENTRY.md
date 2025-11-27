# API Reference Entry Template

Use this template when documenting API endpoints in the API_ENDPOINTS.md file.

---

## [Endpoint Name]

**Description:** [One-sentence description of what this endpoint does]

**Category:** Authentication / Workspace / Classic / Admin / File Management

---

### Request

**Method:** `POST` / `GET` / `PUT` / `DELETE`
**Endpoint:** `/api/path/to/endpoint`
**Authentication:** Required / Optional / Admin Only

**Headers:**
| Header | Required | Description |
|--------|----------|-------------|
| Content-Type | Yes | application/json |
| Authorization | Yes | Session cookie |

**Parameters:**

| Name | Type | Required | Location | Default | Description |
|------|------|----------|----------|---------|-------------|
| param1 | string | Yes | Body | - | Description of param1 |
| param2 | number | No | Body | 10 | Description of param2 |
| param3 | boolean | No | Query | false | Description of param3 |
| param4 | object | Yes | Body | - | Description with structure below |

**param4 Structure:**
```javascript
{
  field1: "value",
  field2: 123,
  nested: {
    subfield: "value"
  }
}
```

---

### Request Example

**JavaScript (Fetch API):**
```javascript
const response = await fetch('/api/path/to/endpoint', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    param1: "value",
    param2: 42,
    param4: {
      field1: "example",
      field2: 100
    }
  })
});

const data = await response.json();
```

**cURL:**
```bash
curl -X POST http://localhost:3000/api/path/to/endpoint \
  -H "Content-Type: application/json" \
  -d '{
    "param1": "value",
    "param2": 42,
    "param4": {
      "field1": "example",
      "field2": 100
    }
  }'
```

---

### Response

**Success Response (200 OK):**
```javascript
{
  "success": true,
  "data": {
    "id": "generated-id-123",
    "status": "completed",
    "result": {
      "field1": "value",
      "field2": 123
    }
  },
  "message": "Operation completed successfully"
}
```

**Response Fields:**
| Field | Type | Description |
|-------|------|-------------|
| success | boolean | Whether operation succeeded |
| data | object | Result data |
| data.id | string | Generated identifier |
| data.status | string | Operation status |
| message | string | Human-readable message |

---

### Error Responses

**400 Bad Request:**
```javascript
{
  "success": false,
  "error": "Invalid parameter: param1 is required"
}
```

**401 Unauthorized:**
```javascript
{
  "success": false,
  "error": "Authentication required"
}
```

**403 Forbidden:**
```javascript
{
  "success": false,
  "error": "User status must be 'active' for this operation"
}
```

**404 Not Found:**
```javascript
{
  "success": false,
  "error": "Resource not found",
  "details": "Training session abc-123 does not exist"
}
```

**500 Internal Server Error:**
```javascript
{
  "success": false,
  "error": "Internal server error",
  "message": "Failed to process request"
}
```

**Error Response Table:**
| Status | Condition | Response |
|--------|-----------|----------|
| 400 | Missing required parameter | `{ success: false, error: "..." }` |
| 400 | Invalid parameter format | `{ success: false, error: "..." }` |
| 401 | Not authenticated | `{ success: false, error: "..." }` |
| 403 | Insufficient permissions | `{ success: false, error: "..." }` |
| 404 | Resource not found | `{ success: false, error: "..." }` |
| 500 | Server error | `{ success: false, error: "..." }` |

---

### Behavior

**What This Endpoint Does:**
[Detailed explanation of the endpoint's behavior, including:]
- What happens when called
- Side effects (database changes, file creation, etc.)
- State changes
- Async operations (if any)

**Processing Flow:**
1. Step 1 of processing
2. Step 2 of processing
3. Step 3 of processing

**Side Effects:**
- Creates file at: `path/to/file`
- Updates session state: `req.session.property`
- Emits Socket.IO event: `event-name`
- Spawns Python process: `python/script.py`

**Performance Considerations:**
- Expected duration: X seconds
- Resource usage: Memory / CPU / Disk
- Concurrent request handling: Yes / No

**Important Notes:**
- ⚠️ This endpoint modifies persistent data
- ℹ️ Results are cached for X seconds
- 🔒 Requires session with active status

---

### Example Use Case

**Scenario:** [Real-world use case]

**Step-by-step:**
1. User action that triggers this endpoint
2. Frontend prepares request
3. Backend processes request
4. Response is returned
5. Frontend handles response

**Code Example:**
```javascript
// Complete working example
async function performTask() {
  try {
    const response = await fetch('/api/path/to/endpoint', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        param1: "example",
        param2: 42
      })
    });

    const result = await response.json();

    if (result.success) {
      console.log('Success:', result.data);
      // Handle success
    } else {
      console.error('Error:', result.error);
      // Handle error
    }
  } catch (error) {
    console.error('Request failed:', error);
    // Handle network error
  }
}
```

---

### Related Endpoints

**Prerequisites:**
- [`POST /api/prerequisite/endpoint`](#post-apiprerequisiteendpoint) - Must be called first

**Related:**
- [`GET /api/related/endpoint`](#get-apirelatedendpoint) - Retrieves related data
- [`POST /api/another/endpoint`](#post-apianotherend point) - Follow-up operation

**Alternative:**
- [`POST /api/alternative/endpoint`](#post-apialternativeendpoint) - Different approach to same goal

---

### See Also

**Documentation:**
- [Architecture: Component Name](../architecture/COMPONENT.md)
- [Guide: How to Use This Feature](../guides/FEATURE.md)

**Code Reference:**
- Implementation: `server.js:123-456`
- Helper function: `utils/helper.js:78-90`

---

### Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.1 | 2025-XX-XX | Added param3, improved error handling |
| 1.0 | 2025-XX-XX | Initial implementation |

---

**Status:** ✅ Stable / ⚠️ Beta / 🚧 Experimental / 🗑️ Deprecated

---

## Template Usage Notes

When documenting an actual endpoint:
1. Copy this template
2. Replace all [bracketed text] with actual values
3. Remove sections that don't apply
4. Add endpoint-specific sections if needed
5. Keep examples realistic and tested
6. Link to related documentation
7. Update version history
