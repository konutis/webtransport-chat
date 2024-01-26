import './App.css';
import { useEffect, useRef, useState } from 'react';

const ENDPOINT = `https://${window.location.hostname}:4433`;

function App() {
  const [isReady, setIsReady] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [messages, setMessages] = useState([] as string[]);

  const transportRef = useRef(null as WebTransport | null);
  const bidirectionalDataWriterRef = useRef(null);
  const bidirectionalDataReaderRef = useRef(null);

  const readData = async (reader, type) => {
    console.log("Reader created", reader, type);
    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        break;
      }
      // value is a Uint8Array.
      const val = new TextDecoder().decode(value);
      setMessages((state) => [...state, val]);
    }
  }
 
  const receiveBidirectional = async (stream) => {
    const reader = stream.getReader();
    while (true) {
      const { done, value: bidi } = await reader.read();
      if (done) {
        break;
      }

      // value is an instance of WebTransportBidirectionalStream
      await readData(bidi.readable.getReader());
    // await writeData(bidi.writable);
    }
  }

  function connect(abortController?: AbortController) {
    let certificateHash: Uint8Array;
    let options: WebTransportOptions | undefined;

    fetch(`${ENDPOINT}/fingerprint`, { method: "GET", signal: abortController?.signal }).
      then((res) => res.json()).
      then((fingerprint) => {
        //
        // The `serverCertificateHashes` option is required during development
        //
        certificateHash = new Uint8Array(fingerprint);

        if (certificateHash.byteLength === 32) {
          options = {
            // requireUnreliable: true,
            // congestionControl: "default", // "low-latency" || "throughput"

            serverCertificateHashes: [{
              algorithm: 'sha-256',
              value: certificateHash.buffer
            }]
          };
        }

      }).catch((e) => {
        console.error(e);

      }).finally(() => {
        // proceed only if not request aborted
        if (!abortController || !abortController.signal.aborted) {
          try {
            transportRef.current = new WebTransport(ENDPOINT, options);
            setupWebTransport(transportRef.current);

          } catch (e: any) {
            console.log({ message: e.toString(), type: 'error' });
          }
        }
      });
  }


  async function setupWebTransport(transport: WebTransport) {
    transport.closed.then((_) => {
      console.log({ message: 'WebTransport is closed', type: 'info' });
    }).catch((e) => {
      console.log({ message: e.toString(), type: 'error' });
    }).finally(() => {
      setIsReady(false);
    });

    transport.ready.then(async () => {
      setIsReady(true);

      const bidi = await transport.createBidirectionalStream();
      const reader = bidi.readable.getReader();
      bidirectionalDataReaderRef.current = reader;
    
      readData(reader, 'readable.reader');
      receiveBidirectional(transport.incomingBidirectionalStreams);
      const writer = bidi.writable.getWriter();
      bidirectionalDataWriterRef.current = writer;
      writer.closed.catch(e => console.log("bidi writable closed", e.toString()));

    }).catch((e) => {
      console.log({ message: e.toString(), type: 'error' });
    }).finally(() => {
      console.log("transport.ready.finally() ...");
    });
  }

  useEffect(() => {
    const abortController = new AbortController();
    connect(abortController);

    return () => {
      if (transportRef.current) {
        transportRef.current.close()

      } else {
        abortController.abort();
      }
    };
  }, []);

  const chatBoxClassNames = ['ChatBox'];
  if (isReady) {
    chatBoxClassNames.push('ChatBoxReady');
  };

  const sendMessage = () => {
    const val = new TextEncoder().encode(inputValue);
    bidirectionalDataWriterRef.current?.write(val);
    setInputValue('');
  }

  const onEnterClick = (e: any) => {
    if (e.key === 'Enter') {
      sendMessage();
    }
  }
  

  return (
    <div className="App">
      <div className={chatBoxClassNames.join(' ')}>
        <div className="ChatBoxMessages">
          {messages.map((message, index) => (<div className="ChatBoxMessage" key={index}>{message}</div>))}
        </div>

        <div className="ChatFooter">
          <input 
            className="ChatInput"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={onEnterClick}
          />
          <button className="ChatButton" type='button' onClick={sendMessage}>
            Send
          </button>
        </div>

      </div>
    </div>
  );
}

export default App;
