# PDF Wrapper API

A simple API that accepts a Google Docs URL and a name, stores the mapping, and returns a direct PDF link for each document.

## Features

- Store and update mappings of document names to Google Docs URLs
- Automatically generates a direct PDF link for each document
- Retrieve the PDF by name

## Getting Started

### Installation

```bash
git clone https://github.com/yourusername/gcal-sync.git
cd gcal-sync
npm install
```

### Running the API

```bash
npm start
```

The API will be available at `http://localhost:3000`.

## Usage

### Create or Update a Document Link

Send a `POST` request to `/view` with a JSON body:

```bash
curl -X POST http://localhost:3000/view \
  -H "Content-Type: application/json" \
  -d '{"name": "My Document", "url": "https://docs.google.com/document/d/your-doc-id/edit"}'
```

#### Response

```json
{
  "url": "http://localhost:3000/view?q=my-document"
}
```

### Retrieve a PDF by Name

Send a `GET` request to `/view?q=my-document`:

```bash
curl -o my-document.pdf "http://localhost:3000/view?q=my-document"
```

If found, the PDF will be returned as a file.

## API Endpoints

| Method | Endpoint   | Description                          |
|--------|------------|--------------------------------------|
| POST   | `/view`    | Create or update a document mapping  |
| GET    | `/view`    | Retrieve PDF by name (`?q=name`)     |

## License

MIT