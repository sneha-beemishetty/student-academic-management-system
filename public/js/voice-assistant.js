/* Dashboard voice controls powered by the browser Web Speech API. */
(function () {
  let dashboardData = null;
  let recognition = null;
  let listening = false;
  let voiceEnabled = true;
  let lastResponse = '';

  const $ = id => document.getElementById(id);

  function setStatus(message, state = 'ready') {
    const status = $('voice-status');
    const card = $('voice-assistant');
    if (status) status.textContent = message;
    if (card) card.dataset.voiceState = state;
  }

  function showResponse(message, kind = 'normal') {
    const response = $('voice-response');
    if (!response) return;
    response.classList.toggle('voice-response-error', kind === 'error');
    response.replaceChildren();
    const mark = document.createElement('span');
    mark.className = 'voice-response-mark';
    mark.setAttribute('aria-hidden', 'true');
    mark.textContent = kind === 'error' ? '!' : '✦';
    const content = document.createElement('span');
    content.className = 'voice-response-text';
    content.textContent = message;
    response.append(mark, content);
  }

  function speak(message) {
    if (!voiceEnabled || !message) return;
    if (!('speechSynthesis' in window) || !('SpeechSynthesisUtterance' in window)) {
      setStatus('Speech output unavailable', 'error');
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(message);
    utterance.lang = 'en-IN';
    utterance.rate = 0.96;
    utterance.onstart = () => { if (!listening) setStatus('Speaking response', 'speaking'); };
    utterance.onend = () => { if (!listening) setStatus(voiceEnabled ? 'Ready · Voice ON' : 'Ready · Voice OFF'); };
    utterance.onerror = () => { if (!listening) setStatus('Could not play response', 'error'); };
    window.speechSynthesis.speak(utterance);
  }

  async function searchStudents(query) {
    const response = await fetch(`/api/voice/students?q=${encodeURIComponent(query)}`, {
      headers: { Accept: 'application/json' },
      credentials: 'same-origin'
    });
    const data = await response.json().catch(() => ({}));
    if (response.status === 401) {
      location.href = '/';
      throw new Error('Your admin session has expired. Please sign in again.');
    }
    if (!response.ok) throw new Error(data.error || 'Student search failed.');
    return data;
  }

  function statisticsReply(query) {
    const data = dashboardData || window.dashboardData;
    if (!data) return 'Dashboard statistics are still loading. Please try again in a moment.';
    const q = query.toLowerCase();
    if (/attendance|present|absence/.test(q) && !/student|faculty|course|overall|summary|dashboard/.test(q)) {
      return `Average attendance is ${data.attendance} percent.`;
    }
    if (/faculty|teacher|staff/.test(q) && !/student|course|attendance|overall|summary|dashboard/.test(q)) {
      return `There are ${data.faculty} faculty members in the system.`;
    }
    if (/course|subject/.test(q) && !/student|faculty|attendance|overall|summary|dashboard/.test(q)) {
      return `There are ${data.courses} courses in the system.`;
    }
    if (/student/.test(q) && !/faculty|course|attendance|overall|summary|dashboard/.test(q)) {
      return `There are ${data.students} students in the system.`;
    }
    const best = (data.performance || []).slice(0, 3).map(item => `${item.course_name}: average ${item.average} out of 100`).join('. ');
    return `Here is the dashboard summary. ${data.students} students, ${data.faculty} faculty members, and ${data.courses} courses. Average attendance is ${data.attendance} percent.${best ? ` Top subject results: ${best}.` : ''}`;
  }

  function extractStudentQuery(query) {
    return query
      .replace(/^(please\s+)?(can you\s+)?(find|search for|search|look up|lookup|tell me about|who is|show me|give me)\s+/i, '')
      .replace(/^(?:a\s+|the\s+)?student\s+(?:details|information|record|profile)\s+(?:for|of)\s+/i, '')
      .replace(/^(?:a\s+|the\s+)?student\s+(?:named|called)\s+/i, '')
      .replace(/^(?:a\s+|the\s+)?student\s+/i, '')
      .replace(/^(?:details|information)\s+(?:for|of)\s+/i, '')
      .replace(/^(?:roll\s*(?:number|no\.?)|email(?: address)?)\s+/i, '')
      .replace(/\s+(student details|details|information|record|profile)\s*$/i, '')
      .replace(/[?.!,]+$/g, '')
      .trim();
  }

  async function handleQuery(rawQuery) {
    const query = String(rawQuery || '').trim();
    if (query.length < 2) {
      showResponse('Please say or type a student name, roll number, or a question about dashboard statistics.', 'error');
      return;
    }
    $('voice-query').value = query;
    setStatus('Looking up records…', 'working');
    try {
      let answer;
      if (/\b(how many|count|total|number of (students?|faculty|courses?)|average attendance|dashboard|overview|summary|statistics|stats)\b/i.test(query)) {
        answer = statisticsReply(query);
      } else {
        const term = extractStudentQuery(query);
        if (!term || /^(students?|faculty|courses?|attendance)$/i.test(term)) {
          answer = 'Try asking for dashboard statistics, or say “Find” followed by a student name or roll number.';
        } else {
          const matches = await searchStudents(term);
          if (!matches.length) {
            answer = `I could not find a student matching ${term}. Try a name, roll number, or email address.`;
          } else if (matches.length === 1) {
            const student = matches[0];
            answer = `${student.full_name}. Roll number ${student.roll_number}. Department ${student.department}, year ${student.year}. Email ${student.email}.${student.phone ? ` Phone ${student.phone}.` : ''}`;
          } else {
            const list = matches.slice(0, 3).map(student => `${student.full_name}, roll number ${student.roll_number}`).join('. ');
            answer = `I found ${matches.length} matching students. ${list}. Say or type a more specific name or roll number for student details.`;
          }
        }
      }
      lastResponse = answer;
      showResponse(answer);
      setStatus(voiceEnabled ? 'Ready · Voice ON' : 'Ready · Voice OFF');
      speak(answer);
    } catch (error) {
      lastResponse = error.message;
      showResponse(error.message, 'error');
      setStatus('Search failed', 'error');
    }
  }

  function stopListening() {
    if (recognition && listening) recognition.stop();
  }

  function startListening() {
    if (!recognition) {
      const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!Recognition) {
        const message = 'Voice input is not supported by this browser. Try Chrome or Edge, or type a search instead.';
        showResponse(message, 'error');
        setStatus('Voice input unavailable', 'error');
        return;
      }
      recognition = new Recognition();
      recognition.lang = 'en-IN';
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;
      recognition.onstart = () => {
        listening = true;
        setStatus('Listening…', 'listening');
        if ('speechSynthesis' in window) window.speechSynthesis.cancel();
      };
      recognition.onresult = event => {
        const transcript = Array.from(event.results).map(result => result[0].transcript).join(' ').trim();
        if (transcript) handleQuery(transcript);
      };
      recognition.onerror = event => {
        const messages = {
          'not-allowed': 'Microphone access was blocked. Allow microphone access in your browser settings and try again.',
          'service-not-allowed': 'The browser speech service is unavailable. You can still type a student search.',
          'no-speech': 'No speech was detected. Press Start Listening and try again.',
          'audio-capture': 'No microphone was found. Connect a microphone or use the search box.'
        };
        const message = messages[event.error] || `Voice input error: ${event.error}. You can also type a search.`;
        showResponse(message, 'error');
        setStatus('Microphone needs attention', 'error');
      };
      recognition.onend = () => {
        listening = false;
        if ($('voice-status')?.textContent === 'Listening…') setStatus(voiceEnabled ? 'Ready · Voice ON' : 'Ready · Voice OFF');
      };
    }
    try {
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();
      recognition.start();
    } catch (error) {
      showResponse('Listening is already active. Finish speaking or wait a moment, then try again.', 'error');
    }
  }

  function initVoiceAssistant(data) {
    dashboardData = data || window.dashboardData || null;
    const form = $('voice-search-form');
    if (!form || form.dataset.voiceBound === 'true') return;
    form.dataset.voiceBound = 'true';
    form.addEventListener('submit', event => {
      event.preventDefault();
      handleQuery($('voice-query').value);
    });
    $('voice-listen').addEventListener('click', startListening);
    $('voice-stop-speaking').addEventListener('click', () => {
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();
      setStatus(listening ? 'Listening…' : (voiceEnabled ? 'Ready · Voice ON' : 'Ready · Voice OFF'), listening ? 'listening' : 'ready');
    });
    $('voice-toggle').addEventListener('click', event => {
      voiceEnabled = !voiceEnabled;
      if (!voiceEnabled && 'speechSynthesis' in window) window.speechSynthesis.cancel();
      event.currentTarget.textContent = voiceEnabled ? 'Voice ON' : 'Voice OFF';
      event.currentTarget.setAttribute('aria-pressed', String(voiceEnabled));
      setStatus(listening ? 'Listening…' : (voiceEnabled ? 'Ready · Voice ON' : 'Ready · Voice OFF'), listening ? 'listening' : 'ready');
    });
    $('voice-speaker').addEventListener('click', () => {
      if (!lastResponse) {
        showResponse('Ask a question or search for a student first, then use the speaker button to hear the response.', 'error');
        return;
      }
      if (!voiceEnabled) {
        showResponse('Turn Voice ON to hear the last response.');
        return;
      }
      speak(lastResponse);
    });
    if (!(window.SpeechRecognition || window.webkitSpeechRecognition)) {
      setStatus('Type or use supported browser', 'ready');
    }
  }

  window.initVoiceAssistant = initVoiceAssistant;
})();
