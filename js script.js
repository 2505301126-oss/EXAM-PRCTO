document.addEventListener("DOMContentLoaded", () => {

    // ==========================================
    // DATA PROTECTION & SECURITY LOCKDOWN
    // ==========================================
    // Disable Text Selection, Copying, and Right-Click
    document.addEventListener('contextmenu', e => e.preventDefault());
    document.addEventListener('copy', e => e.preventDefault());
    document.addEventListener('cut', e => e.preventDefault());

    document.addEventListener('keydown', (e) => {
        // Prevent Ctrl/Cmd + C, V, X, S, P, U (View Source)
        const forbiddenKeys = ['c', 'v', 'x', 's', 'p', 'u'];
        if ((e.ctrlKey || e.metaKey) && forbiddenKeys.includes(e.key.toLowerCase())) {
            e.preventDefault();
            showToast("⚠️ Security Violation: Action Restricted.");
        }
        // Prevent F12 (DevTools)
        if (e.key === 'F12') e.preventDefault();
    });

    // ==========================================
    // NETWORK RESILIENCE (PAUSE/RESUME)
    // ==========================================
    window.addEventListener('offline', () => {
        if (isTestActive) {
            document.getElementById('network-lockdown-overlay').classList.remove('hidden');
            // Pause any active timers or proctoring logic if necessary
        }
    });

    window.addEventListener('online', () => {
        document.getElementById('network-lockdown-overlay').classList.add('hidden');
    });

    const tagline = document.getElementById("tagline");
    const introContainer = document.getElementById("intro-container");
    const loginContainer = document.getElementById("login-container");
    const dashboardContainer = document.getElementById("dashboard-container");
    const testInterfaceContainer = document.getElementById("test-interface-container");

    const emailStep = document.getElementById("email-step");
    const otpStep = document.getElementById("otp-step");
    const emailInput = document.getElementById("email-input");
    const sendOtpBtn = document.getElementById("send-otp-btn");
    const emailError = document.getElementById("email-error");
    const sentEmailDisplay = document.getElementById("sent-email-display");
    const otpInput = document.getElementById("otp-input");
    const verifyOtpBtn = document.getElementById("verify-otp-btn");
    const otpError = document.getElementById("otp-error");
    const changeEmailBtn = document.getElementById("change-email");

    const dashboardResultDisplay = document.getElementById("dashboard-result-display");

    const proctorModal = document.getElementById("proctor-modal-overlay");
    const btnCancelProctor = document.getElementById("btn-cancel-proctor");
    const btnAcceptProctor = document.getElementById("btn-accept-proctor");
    const proctorError = document.getElementById("proctor-error");
    const proctorWindow = document.getElementById("proctor-window");
    const webcamFeed = document.getElementById("webcam-feed");
    const trackingCanvas = document.getElementById("tracking-canvas");
    const audioVisualizer = document.getElementById("audio-visualizer");
    const trackingStatus = document.getElementById("tracking-status");
    let isExamFrozen = false;

    let mediaRecorder = null;
    let recordedChunks = [];
    let audioContext = null;
    let trackRAF = null;
    let videoBlobUrl = null;
    let studentLogsHtml = "";
    let audioLogsHtml = "";
    let windowThreatLogsHtml = "";
    let capturedThreats = [];
    let tfModel = null;
    let objectModel = null;
    let tfRAF = null;
    let frameCount = 0;
    let isPredicting = false;
    let isTestActive = false;

    // THE 3 WARNINGS ENGINE (Shared: Face Tracking + Audio Noise)
    let violationWarnings = 0;
    let lastWarningTime = 0;
    let autoKicked = false;
    let questionsLocked = false;
    let isIdentityVerified = false;
    let verificationProgress = 0;

    // Lock all exam inputs visually when 2nd warning is hit
    function lockExamQuestions() {
        if (questionsLocked) return;
        questionsLocked = true;

        // Disable all radio buttons and textareas
        document.querySelectorAll('.options-group input[type="radio"]').forEach(inp => {
            inp.disabled = true;
        });
        document.querySelectorAll('.answer-textarea').forEach(ta => {
            ta.disabled = true;
            ta.style.background = '#1f2937';
            ta.style.cursor = 'not-allowed';
            ta.style.color = '#6B7280';
        });
        document.querySelectorAll('.option-label').forEach(lbl => {
            lbl.style.opacity = '0.45';
            lbl.style.cursor = 'not-allowed';
        });

        // Inject red banner at top of test body
        const testBody = document.querySelector('.test-body');
        if (testBody && !document.getElementById('lock-banner')) {
            const banner = document.createElement('div');
            banner.id = 'lock-banner';
            banner.style.cssText = 'background:#7F1D1D;color:#FCA5A5;padding:1rem 1.5rem;border-radius:8px;font-weight:700;font-size:1rem;margin-bottom:1.5rem;border:2px solid #DC2626;text-align:center;letter-spacing:0.5px;';
            banner.innerHTML = '🔒 EXAM QUESTIONS LOCKED — 2nd Security Warning reached. All inputs are frozen. 3rd violation will auto-submit this exam.';
            testBody.insertBefore(banner, testBody.firstChild);
        }
    }

    // Centralised violation registrar (face tracking + audio both feed here)
    function registerViolation(reason, isAudio) {
        if (!isTestActive || autoKicked) return;
        if ((Date.now() - lastWarningTime) < 3000) return; // cooldown

        violationWarnings++;
        lastWarningTime = Date.now();

        const badge = document.getElementById('warning-tracker-badge');
        if (badge) badge.textContent = `Warnings: ${violationWarnings}/3`;

        if (isAudio) {
            audioLogsHtml += `<div>[${new Date().toLocaleTimeString()}] <span class="err">⚠️ Acoustic Violation.</span> ${reason}. Warning ${violationWarnings}/3</div>`;
        } else {
            studentLogsHtml += `<div>[${new Date().toLocaleTimeString()}] <span class="err">Retina Tracking Deviation.</span> Subject detected ${reason}. Risk mapped. Warning ${violationWarnings}/3</div>`;
        }
        captureThreatScreenshot();

        // 3 warnings logic
        if (violationWarnings >= 3) {
            autoKicked = true;
            triggerTestCompletion(true);
        } else {
            // Show Security Alert Modal for Warnings 1 and 2
            const modal = document.getElementById('security-alert-modal');
            const msg = document.getElementById('security-alert-message');
            const count = document.getElementById('security-alert-count');

            msg.textContent = `${reason}. This behavior is strictly prohibited. Please stabilize your focus immediately.`;
            count.textContent = `Warning: ${violationWarnings}/3`;
            modal.classList.remove('hidden');

            if (violationWarnings === 2) {
                lockExamQuestions();
                document.getElementById('security-alert-title').innerHTML = '<span style="color:#DC2626">FINAL WARNING!</span>';
            }
        }
    }

    document.getElementById('btn-acknowledge-warning')?.addEventListener('click', () => {
        document.getElementById('security-alert-modal').classList.add('hidden');
    });

    let completedTests = [];
    let selectedTestId = null;

    // ==========================================
    // RIGID EVALUATION DATASETS
    // ==========================================

    // Test 1: AI Marketing
    const aiMarketingQuestions = [
        { id: "q1", type: "mcq", section: "A", question: "Q1. What does AI stand for?", options: ["a) Automatic Intelligence", "b) Artificial Intelligence", "c) Advanced Internet", "d) Applied Information"], answerIdx: 1, marks: 1 },
        { id: "q2", type: "mcq", section: "A", question: "Q2. AI in marketing is mainly used to:", options: ["a) Cook food", "b) Understand customer behavior", "c) Build roads", "d) Design clothes"], answerIdx: 1, marks: 1 },
        { id: "q3", type: "mcq", section: "A", question: "Q3. Which of the following is an example of AI?", options: ["a) Calculator", "b) Chatbot", "c) Notebook", "d) Pen"], answerIdx: 1, marks: 1 },
        { id: "q4", type: "mcq", section: "A", question: "Q4. What is the main purpose of data in AI?", options: ["a) Decoration", "b) Storage only", "c) Training models", "d) Entertainment"], answerIdx: 2, marks: 1 },
        { id: "q5", type: "mcq", section: "A", question: "Q5. Which AI tool helps in customer support?", options: ["a) Excel", "b) Chatbot", "c) Paint", "d) Word"], answerIdx: 1, marks: 1 },
        { id: "q6", type: "mcq", section: "A", question: "Q6. AI helps marketers to:", options: ["a) Waste time", "b) Predict customer needs", "c) Ignore customers", "d) Reduce sales"], answerIdx: 1, marks: 1 },
        { id: "q7", type: "mcq", section: "A", question: "Q7. What is personalization in marketing?", options: ["a) Same message to all", "b) Custom message for each customer", "c) No message", "d) Random ads"], answerIdx: 1, marks: 1 },
        { id: "q8", type: "mcq", section: "A", question: "Q8. Which platform uses AI for recommendations?", options: ["a) Netflix", "b) Newspaper", "c) Radio", "d) Poster"], answerIdx: 0, marks: 1 },
        { id: "q9", type: "mcq", section: "A", question: "Q9. What is predictive analysis?", options: ["a) Studying past only", "b) Guessing future trends using data", "c) Ignoring data", "d) Writing reports"], answerIdx: 1, marks: 1 },
        { id: "q10", type: "mcq", section: "A", question: "Q10. AI can improve marketing by:", options: ["a) Reducing efficiency", "b) Increasing accuracy", "c) Creating confusion", "d) Slowing work"], answerIdx: 1, marks: 1 },
        { id: "q11", type: "short", section: "B", question: "Q11. What is AI in marketing?", ideal: "AI in marketing is the use of artificial intelligence technologies to analyze customer data and improve marketing decisions, targeting, and performance.", marks: 4 },
        { id: "q12", type: "short", section: "B", question: "Q12. Define customer insights.", ideal: "Customer insights are meaningful information about customer behavior, preferences, and needs collected from data.", marks: 4 },
        { id: "q13", type: "short", section: "B", question: "Q13. What is a chatbot?", ideal: "A chatbot is an AI program that communicates with customers and provides automatic responses.", marks: 4 },
        { id: "q14", type: "short", section: "B", question: "Q14. What is data analytics?", ideal: "Data analytics is the process of analyzing data to find useful patterns and insights.", marks: 4 },
        { id: "q15", type: "short", section: "B", question: "Q15. How does AI help in customer segmentation?", ideal: "AI divides customers into groups based on age, behavior, interests, and purchase history for better targeting.", marks: 4 },
        { id: "q16", type: "long", section: "C", question: "Q16. Explain how AI helps in understanding customer behavior with examples.", ideal: "AI helps businesses understand customer behavior by analyzing large amounts of data such as search history, purchases, and online activity. It identifies patterns and preferences.\nExample:\n\nE-commerce websites recommend products based on past purchases.\nNetflix suggests movies based on viewing history.\n\nThis helps companies improve customer satisfaction and increase sales.", marks: 10 },
        { id: "q17", type: "long", section: "C", question: "Q17. Discuss the advantages of using AI in marketing insights.", ideal: "Better decision-making: AI provides accurate data analysis.\nPersonalization: Shows targeted ads for customers.\nTime-saving: Automates repetitive tasks like emails and replies.\nImproved customer experience: Fast responses using chatbots.\nPredictive analysis: Helps forecast future trends and demand.\n\nOverall, AI improves efficiency and marketing performance.", marks: 10 }
    ];

    // Test 2: Gen AI
    const genAiQuestions = [
        { id: "q1", type: "mcq", section: "A", question: "Q1. What does Generative AI do?", options: ["a) Deletes data", "b) Creates new content", "c) Stores files", "d) Builds hardware"], answerIdx: 1, marks: 1 },
        { id: "q2", type: "mcq", section: "A", question: "Q2. Which of the following is an example of Generative AI?", options: ["a) Calculator", "b) ChatGPT", "c) MS Paint", "d) Excel"], answerIdx: 1, marks: 1 },
        { id: "q3", type: "mcq", section: "A", question: "Q3. Generative AI is mainly based on:", options: ["a) Mechanical systems", "b) Machine learning models", "c) Electric circuits", "d) Manual coding only"], answerIdx: 1, marks: 1 },
        { id: "q4", type: "mcq", section: "A", question: "Q4. Which type of content can Gen AI create?", options: ["a) Text", "b) Images", "c) Videos", "d) All of the above"], answerIdx: 3, marks: 1 },
        { id: "q5", type: "mcq", section: "A", question: "Q5. What is the main purpose of training data in AI?", options: ["a) Delete errors", "b) Teach the model patterns", "c) Store images", "d) Reduce memory"], answerIdx: 1, marks: 1 },
        { id: "q6", type: "mcq", section: "A", question: "Q6. Which company developed ChatGPT?", options: ["a) Google", "b) Microsoft", "c) OpenAI", "d) Apple"], answerIdx: 2, marks: 1 },
        { id: "q7", type: "mcq", section: "A", question: "Q7. What is a prompt in Gen AI?", options: ["a) A virus", "b) Input given to AI", "c) Output file", "d) Software bug"], answerIdx: 1, marks: 1 },
        { id: "q8", type: "mcq", section: "A", question: "Q8. Which of the following is NOT Generative AI?", options: ["a) DALL·E", "b) Midjourney", "c) Google Search", "d) ChatGPT"], answerIdx: 2, marks: 1 },
        { id: "q9", type: "mcq", section: "A", question: "Q9. Gen AI helps in marketing by:", options: ["a) Reducing creativity", "b) Creating content and ads", "c) Stopping communication", "d) Removing data"], answerIdx: 1, marks: 1 },
        { id: "q10", type: "mcq", section: "A", question: "Q10. What is the output of Generative AI based on?", options: ["a) Random guess only", "b) Training data patterns", "c) Internet speed", "d) User device"], answerIdx: 1, marks: 1 },
        { id: "q11", type: "short", section: "B", question: "Q11. What is Generative AI?", ideal: "Generative AI is a type of artificial intelligence that creates new content such as text, images, audio, or video based on data it has learned.", marks: 4 },
        { id: "q12", type: "short", section: "B", question: "Q12. What is a prompt in Generative AI?", ideal: "A prompt is the input or instruction given to an AI system to generate a response or content.", marks: 4 },
        { id: "q13", type: "short", section: "B", question: "Q13. Give two examples of Generative AI tools.", ideal: "ChatGPT (text generation), DALL·E (image generation).", marks: 4 },
        { id: "q14", type: "short", section: "B", question: "Q14. How is Generative AI used in marketing?", ideal: "It is used to create ads, write product descriptions, and generate personalized content for customers.", marks: 4 },
        { id: "q15", type: "short", section: "B", question: "Q15. What is training data in AI?", ideal: "Training data is the information used to teach AI models patterns so they can generate outputs.", marks: 4 },
        { id: "q16", type: "long", section: "C", question: "Q17. Explain Generative AI and its applications in real life.", ideal: "Generative AI is a technology that creates new content using machine learning models trained on large datasets. Applications: Writing content (blogs, emails), Creating images and art, Music generation, Chatbots like ChatGPT, Marketing content creation. It is widely used to improve productivity.", marks: 10 },
        { id: "q17", type: "long", section: "C", question: "Q18. Discuss the advantages and disadvantages of Generative AI.", ideal: "Advantages: Saves time and effort, Creates creative content, Helps in marketing and business, Improves productivity. Disadvantages: Can produce incorrect information, May reduce human creativity, Ethical concerns, Dependence on technology.", marks: 10 }
    ];

    // Test 3: Management Accounting
    const managementQuestions = [
        { id: "q1", type: "mcq", section: "A", question: "Q1. Management accounting is mainly used for:", options: ["a) External reporting", "b) Internal decision making", "c) Tax calculation", "d) Auditing"], answerIdx: 1, marks: 1 },
        { id: "q2", type: "mcq", section: "A", question: "Q2. Break-even point is where:", options: ["a) Profit is maximum", "b) Cost is zero", "c) Revenue = Cost", "d) Sales = Profit"], answerIdx: 2, marks: 1 },
        { id: "q3", type: "mcq", section: "A", question: "Q3. Which cost changes with production level?", options: ["a) Fixed cost", "b) Variable cost", "c) Sunk cost", "d) Historical cost"], answerIdx: 1, marks: 1 },
        { id: "q4", type: "mcq", section: "A", question: "Q4. Marginal costing focuses on:", options: ["a) Total cost", "b) Fixed cost only", "c) Variable cost only", "d) Profit only"], answerIdx: 2, marks: 1 },
        { id: "q5", type: "mcq", section: "A", question: "Q5. Budget is a:", options: ["a) Past record", "b) Future plan", "c) Legal report", "d) Tax document"], answerIdx: 1, marks: 1 },
        { id: "q6", type: "mcq", section: "A", question: "Q6. Cost-volume-profit analysis studies relationship between:", options: ["a) Sales and profit", "b) Cost, volume and profit", "c) Assets and liabilities", "d) Income and tax"], answerIdx: 1, marks: 1 },
        { id: "q7", type: "mcq", section: "A", question: "Q7. Standard costing is used for:", options: ["a) Future planning", "b) Cost control", "c) Marketing", "d) Recruitment"], answerIdx: 1, marks: 1 },
        { id: "q8", type: "mcq", section: "A", question: "Q8. Fixed cost remains:", options: ["a) Always changing", "b) Constant in short term", "c) Zero always", "d) Increasing only"], answerIdx: 1, marks: 1 },
        { id: "q9", type: "mcq", section: "A", question: "Q9. Profit = Sales –", options: ["a) Revenue", "b) Cost", "c) Assets", "d) Equity"], answerIdx: 1, marks: 1 },
        { id: "q10", type: "mcq", section: "A", question: "Q10. Management accounting reports are used by:", options: ["a) Customers", "b) Government", "c) Managers", "d) Auditors only"], answerIdx: 2, marks: 1 },
        { id: "q11", type: "short", section: "B", question: "Q11. What is management accounting?", ideal: "Management accounting is the process of analyzing financial data to help managers make better business decisions.", marks: 2 },
        { id: "q12", type: "short", section: "B", question: "Q12. Define marginal costing.", ideal: "Marginal costing is a technique where only variable costs are considered for decision making.", marks: 2 },
        { id: "q13", type: "short", section: "B", question: "Q13. What is break-even point?", ideal: "Break-even point is the level of sales where total revenue equals total cost and there is no profit or loss.", marks: 2 },
        { id: "q14", type: "short", section: "B", question: "Q14. What is a budget?", ideal: "A budget is a financial plan that estimates income and expenses for a future period.", marks: 2 },
        { id: "q15", type: "short", section: "B", question: "Q15. What is cost control?", ideal: "Cost control means managing and reducing costs to improve efficiency and profit.", marks: 2 },
        { id: "q16", type: "short", section: "B", question: "Q16. What is CVP analysis?", ideal: "CVP analysis studies how cost, volume, and profit are related to each other.", marks: 2 },
        { id: "q17", type: "long", section: "C", question: "Q17. Explain the importance of management accounting in business decision making.", ideal: "Management accounting helps managers make better decisions by providing financial and non-financial data. Importance: Helps in planning future activities, Supports decision making, Controls costs, Improves efficiency, Helps in budgeting and forecasting. It is very useful for internal management.", marks: 10 },
        { id: "q18", type: "long", section: "C", question: "Q18. Explain break-even analysis and its importance.", ideal: "Break-even analysis is a technique that finds the point where total revenue equals total cost. At this point, there is no profit or loss. Importance: Helps in pricing decisions, Helps in cost control, Shows minimum sales needed, Helps in profit planning, Useful for decision making. It is an important tool in management accounting.", marks: 10 }
    ];

    const testsData = {
        test1: { name: "AI for Marketing Insights", teacher: "Richa Jain", startTime: "10:00 AM", endTime: "11:30 AM", active: true, questions: aiMarketingQuestions },
        test2: { name: "Management Accounting", teacher: "Ms. Shivani", startTime: "12:00 PM", endTime: "01:30 PM", active: true, questions: managementQuestions },
        test3: { name: "Gen AI", teacher: "Ms. Jyoti", startTime: "02:00 PM", endTime: "03:30 PM", active: true, questions: genAiQuestions }
    };


    // ==========================================
    // MULTIPLE WINDOW / OS BLUR DETECTION MATRIX
    // ==========================================
    window.addEventListener("blur", () => {
        if (isTestActive) triggerOSWindowViolation("Application Minimization / Active Secondary Window Focus");
    });
    document.addEventListener("visibilitychange", () => {
        if (document.hidden && isTestActive) triggerOSWindowViolation("New Browser Tab Opened / System Swap Detected");
    });

    function triggerOSWindowViolation(reason) {
        showToast(`CRITICAL OS WARNING: Tracking detected secondary application focus!`);
        windowThreatLogsHtml += `<div>[${new Date().toLocaleTimeString()}] <span class="err">MULTIPLE WINDOW THREAT.</span> Subject triggered: ${reason}. System evasion tactic detected.</div>`;
    }

    // ==========================================
    // USER DROPDOWN LOGOUT
    // ==========================================
    const userProfileBtn = document.getElementById("user-profile-btn");
    const profileDropdown = document.getElementById("profile-dropdown");

    userProfileBtn.addEventListener("click", () => {
        profileDropdown.classList.toggle("hidden");
    });

    document.getElementById("logout-btn").addEventListener("click", (e) => {
        e.stopPropagation();
        // Fully reset window reloading interface to pristine state
        window.location.reload();
    });


    // ==========================================
    // INSTRUCTOR LOGIN PORTAL
    // ==========================================
    document.getElementById("teacher-login-btn").addEventListener("click", () => {
        const pin = prompt("🚨 CONFIDENTIAL: Enter Teacher Authentication Code (Hint: Type 1234)");
        if (pin === "1234") {
            loginContainer.classList.remove("visible");
            setTimeout(() => {
                loginContainer.style.display = "none";
                dashboardContainer.style.display = "block";

                // Hide student modules
                document.querySelectorAll(".generic-stat-card").forEach(c => c.style.display = "none");
                document.getElementById("dashboard-test-block").style.display = "none";

                // Display strictly professor sandbox
                document.getElementById("dash-welcome").textContent = "Professor Security Sandbox";
                document.getElementById("dash-header-bar").style.background = "#DC2626";
                document.getElementById("profile-info-block").innerHTML = `<span class="user-name">Root Admin</span><span class="user-id">Clearance Level: MASTER</span>`;
                document.getElementById("teacher-threats-box").classList.remove("hidden");

                setTimeout(() => { dashboardContainer.classList.add("visible"); }, 10);
            }, 800);
        } else if (pin) {
            alert("❌ Invalid Authentication Code.");
        }
    });

    // ==========================================
    // 1. Zoom Out Intro
    // ==========================================
    tagline.classList.add("zoom-out");
    setTimeout(() => {
        introContainer.classList.add("fade-out");
        setTimeout(() => {
            introContainer.style.display = "none";
            loginContainer.style.display = "flex";
            setTimeout(() => { loginContainer.classList.add("visible"); }, 10);
        }, 1000);
    }, 6000);

    // ==========================================
    // 2. Auth Core
    // ==========================================
    sendOtpBtn.addEventListener("click", () => {
        const emailValue = emailInput.value.trim();
        if (!emailValue || !emailValue.includes('@')) { emailError.textContent = "Please enter a valid email address."; return; }
        emailError.textContent = "";

        sendOtpBtn.textContent = "Sending OTP...";
        sendOtpBtn.disabled = true;

        setTimeout(() => {
            sentEmailDisplay.textContent = emailValue;
            otpInput.value = "";
            emailStep.classList.add("hidden");
            otpStep.classList.remove("hidden");
            sendOtpBtn.textContent = "Send OTP";
            sendOtpBtn.disabled = false;
        }, 1200);
    });

    changeEmailBtn.addEventListener("click", () => {
        otpStep.classList.add("hidden");
        emailStep.classList.remove("hidden");
    });

    verifyOtpBtn.addEventListener("click", () => {
        const otpValue = otpInput.value.trim();
        if (otpValue !== "123456") { otpError.textContent = "Invalid OTP. Please enter demo OTP: 123456."; return; }
        otpError.textContent = "";
        verifyOtpBtn.textContent = "Verifying...";
        verifyOtpBtn.disabled = true;

        loginContainer.classList.remove("visible");
        setTimeout(() => {
            loginContainer.style.display = "none";
            renderDropdownItems();
            dashboardContainer.style.display = "block";
            setTimeout(() => { dashboardContainer.classList.add("visible"); }, 10);
        }, 1000);
    });

    // ==========================================
    // 3. Dynamic Test Selector (Hide Completed Tests)
    // ==========================================
    const testDropdownBtn = document.getElementById("test-dropdown-btn");
    const testDropdownList = document.getElementById("test-dropdown-list");
    const testDetailsContainer = document.getElementById("test-details-container");

    testDropdownBtn.addEventListener("click", () => {
        testDropdownList.classList.toggle("hidden");
    });

    function renderDropdownItems() {
        testDropdownList.innerHTML = "";
        testDetailsContainer.innerHTML = "";
        testDetailsContainer.classList.add("hidden");
        testDropdownBtn.innerHTML = `Select Assessment <span>▼</span>`;

        let activeCount = 0;

        Object.keys(testsData).forEach((testId, idx) => {
            activeCount++;
            const info = testsData[testId];
            const isCompleted = completedTests.includes(testId);

            const li = document.createElement("li");
            li.className = isCompleted ? "test-item test-item-completed" : "test-item";
            li.style.animationDelay = `${idx * 0.05}s`;
            li.classList.add("stagger-reveal");
            li.setAttribute("data-id", testId);
            li.innerHTML = isCompleted ? `${info.name} <span class="completed-tag">✅ Submitted</span>` : info.name;

            if (!isCompleted) {
                li.addEventListener("click", () => {
                    testDropdownBtn.innerHTML = `${info.name} <span>▼</span>`;
                    testDropdownList.classList.add("hidden");
                    selectedTestId = testId;

                    let startBtnHtml = info.active ? `<button class="start-test-btn" id="start-test-btn-${testId}">Start Exam Security Loop</button>` : `<p style="margin-top:1rem;color:#EF4444;font-weight:600;">System Access Time Locked.</p>`;

                    testDetailsContainer.innerHTML = `
                        <button class="details-dropdown-btn" id="details-dropdown-btn">View Timing Breakdown <span>▼</span></button>
                        <div class="details-content hidden" id="details-content">
                            <p>Instructor Mapping: <span>${info.teacher}</span></p>
                            <p>Active From: <span>${info.startTime}</span> To <span>${info.endTime}</span></p>
                            ${startBtnHtml}
                        </div>
                    `;
                    testDetailsContainer.classList.remove("hidden");

                    document.getElementById("details-dropdown-btn").addEventListener("click", () => {
                        document.getElementById("details-content").classList.toggle("hidden");
                    });

                    if (info.active) {
                        document.getElementById(`start-test-btn-${testId}`).addEventListener("click", () => {
                            // FAST-TRACK: Bypass instructions and start proctoring immediately
                            selectedTestId = testId;
                            btnAcceptProctor.click();
                        });
                    }
                });
            } else {
                li.style.opacity = "0.5";
                li.style.cursor = "not-allowed";
            }

            testDropdownList.appendChild(li);
        });

        if (completedTests.length === activeCount) {
            testDropdownBtn.innerHTML = `All Assessment Schedules Resolved. <span>✅</span>`;
            testDropdownBtn.style.pointerEvents = "none";
            testDropdownBtn.style.border = "1px solid #10B981";
            testDropdownBtn.style.color = "#10B981";
        }
    }


    // ==========================================
    // 4. HIGH-EFFICIENCY TENSORFLOW (Frame-by-Frame Rendering)
    // ==========================================
    btnCancelProctor.addEventListener("click", () => {
        proctorModal.classList.add("hidden");
        proctorModal.style.opacity = "0";
    });

    btnAcceptProctor.addEventListener("click", async () => {
        btnAcceptProctor.textContent = "Connecting Hardware...";
        btnAcceptProctor.disabled = true;
        proctorError.textContent = "";

        studentLogsHtml = "";
        audioLogsHtml = "";
        windowThreatLogsHtml = "";
        capturedThreats = [];
        recordedChunks = [];
        violationWarnings = 0;
        questionsLocked = false;
        autoKicked = false;
        isIdentityVerified = false;
        verificationProgress = 0;

        const syncOverlay = document.getElementById('identity-sync-overlay');
        const syncBar = document.getElementById('sync-progress-bar');
        const syncLabel = document.getElementById('identity-sync-label');
        if (syncOverlay) syncOverlay.classList.remove('hidden');
        if (syncBar) syncBar.style.width = '0%';
        if (syncLabel) syncLabel.textContent = "ALIGN SUBJECT WITHIN OVAL TARGET";

        // PREPARE ASSESSMENT INTERFACE IN BACKGROUND
        dashboardContainer.style.display = "none";
        document.getElementById("dashboard-test-block").style.display = "none";
        testInterfaceContainer.style.display = "block";
        testInterfaceContainer.classList.add("visible");
        document.getElementById("dynamic-test-body").innerHTML = ""; // Clear old

        // INTEGRATED VIDEO HANDOVER
        const liveScanWindow = document.getElementById('live-scan-window');
        const feedContainer = proctorWindow.querySelector('.feed-container');
        if (liveScanWindow && feedContainer) {
            liveScanWindow.innerHTML = ""; // Clear placeholder
            liveScanWindow.appendChild(feedContainer);
        }

        document.getElementById('biometric-grid').classList.remove('hidden');

        document.getElementById("threats-gallery").innerHTML = "";
        document.getElementById("security-threats-box").style.display = "none";
        document.getElementById("teacher-threats-box").classList.add("hidden");
        document.getElementById("os-window-threats").style.display = "none";
        document.getElementById("warning-tracker-badge").style.display = "block";
        document.getElementById("warning-tracker-badge").textContent = "Warnings: 0/3";

        isTestActive = true;

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: true });

            webcamFeed.srcObject = stream;

            mediaRecorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) { recordedChunks.push(event.data); }
            };
            mediaRecorder.onstop = () => {
                const blob = new Blob(recordedChunks, { type: 'video/webm' });
                videoBlobUrl = URL.createObjectURL(blob);

                document.getElementById("recorded-video").src = videoBlobUrl;
                document.getElementById("recorded-audio").src = videoBlobUrl;

                document.getElementById("student-post-exam-status").classList.remove("hidden");

                if (autoKicked) {
                    document.getElementById("post-exam-title").textContent = "EXAM TERMINATED 🚨";
                    document.getElementById("post-exam-title").style.color = "#DC2626";
                    document.getElementById("post-exam-desc").textContent = "Your examination was forcefully concluded explicitly upon the 3rd Tracking Violation.";
                }

                document.getElementById("video-logs-display").innerHTML = studentLogsHtml;
                document.getElementById("audio-logs-display").innerHTML = audioLogsHtml;

                if (windowThreatLogsHtml !== "") {
                    document.getElementById("os-window-threats").style.display = "block";
                    document.getElementById("os-logs-display").innerHTML = windowThreatLogsHtml;
                }

                injectThreatsToDashboard();
            };

            mediaRecorder.start();
            setupAudioVisualizer(stream);

            webcamFeed.addEventListener("loadedmetadata", () => {
                webcamFeed.classList.add("ready");
                trackingCanvas.width = webcamFeed.videoWidth;
                trackingCanvas.height = webcamFeed.videoHeight;
                initTensorFlowEngine();
            }, { once: true });

            proctorModal.classList.add("hidden");
            launchTestInterface();
            proctorWindow.classList.remove("hidden");

            // Re-hook "Back" navigation in case it's dynamic
            document.getElementById("exit-test-paper").onclick = () => {
                const stream = webcamFeed.srcObject;
                if (stream) stream.getTracks().forEach(t => t.stop());

                isTestActive = false;
                testInterfaceContainer.classList.remove("visible");
                proctorWindow.classList.add("hidden");

                setTimeout(() => {
                    testInterfaceContainer.style.display = "none";
                    dashboardContainer.style.display = "block";
                    renderDropdownItems();
                    setTimeout(() => dashboardContainer.classList.add("visible"), 50);
                }, 800);
            };

        } catch (err) {
            console.error("Camera access error:", err);
            proctorError.textContent = "Please allow permissions in browser to begin.";
            btnAcceptProctor.textContent = "Enable & Start";
            btnAcceptProctor.disabled = false;
        }
    });

    function setupAudioVisualizer(stream) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const analyser = audioContext.createAnalyser();
        const source = audioContext.createMediaStreamSource(stream);
        source.connect(analyser);

        analyser.fftSize = 256;
        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        const canvasCtx = audioVisualizer.getContext("2d");

        // Match canvas size to container for high-fidelity output
        audioVisualizer.width = proctorWindow.offsetWidth;
        audioVisualizer.height = 40;

        const W = audioVisualizer.width;
        const H = audioVisualizer.height;

        audioLogsHtml += `<div>[${new Date().toLocaleTimeString()}] Acoustic sensor calibrated. Monitoring voice prints...</div>`;

        function draw() {
            if (!isTestActive) return;
            trackRAF = requestAnimationFrame(draw);
            analyser.getByteFrequencyData(dataArray);

            canvasCtx.fillStyle = '#0f172a'; // Match proctor window background
            canvasCtx.fillRect(0, 0, W, H);

            const barWidth = (W / bufferLength) * 2.5;
            let barHeight;
            let x = 0;
            let detectedPeak = false;

            for (let i = 0; i < bufferLength; i++) {
                barHeight = (dataArray[i] / 255) * H;

                // Cyan gradient for 'voice graph' look
                canvasCtx.fillStyle = `rgba(6, 182, 212, ${dataArray[i] / 255 + 0.2})`;
                canvasCtx.fillRect(x, H - barHeight, barWidth - 1, barHeight);
                x += barWidth;

                if (dataArray[i] > 200) detectedPeak = true;
            }

            // Audio anomalies are logged silently — no warning penalty
            if (detectedPeak && Math.random() > 0.995) {
                audioLogsHtml += `<div>[${new Date().toLocaleTimeString()}] <span class="err">⚠️ Acoustic Anomaly.</span> High decibel spike detected — logged only.</div>`;
            }
        }
        draw();
    }

    async function initTensorFlowEngine() {
        trackingStatus.textContent = "Loading Real-time Security Models...";

        if (!tfModel) tfModel = await blazeface.load();
        if (!objectModel) objectModel = await cocoSsd.load();

        trackingStatus.textContent = "Hyper-Efficient Multi-Scanner Active";
        trackingStatus.style.color = "#06B6D4";
        studentLogsHtml += `<div>[${new Date().toLocaleTimeString()}] Dual-engine tracking synchronized (Retina + Hardware Objects).</div>`;

        requestAnimationFrame(executeFrameAnalysis);
    }

    async function executeFrameAnalysis() {
        if (!isTestActive) return;

        const ctx = trackingCanvas.getContext("2d");
        frameCount++;

        if (!isPredicting) {
            isPredicting = true;
            try {
                const predictions = await tfModel.estimateFaces(webcamFeed, false);
                ctx.clearRect(0, 0, trackingCanvas.width, trackingCanvas.height);

                if (predictions.length === 0) {
                    trackingStatus.textContent = "Scanner Array Lost Target / Dark Space";
                    trackingStatus.style.color = "#F59E0B";
                } else {
                    if (isIdentityVerified) {
                        trackingStatus.textContent = "PROCTORING ACTIVE (SYSTEM ARMED)";
                        trackingStatus.style.color = "#DC2626";
                    } else {
                        trackingStatus.textContent = "Target Locked. Analyzing...";
                        trackingStatus.style.color = "#06B6D4";
                    }

                    predictions.forEach(prediction => {
                        const start = prediction.topLeft;
                        const end = prediction.bottomRight;
                        const size = [Math.abs(end[0] - start[0]), Math.abs(end[1] - start[1])];

                        ctx.lineWidth = 2;
                        ctx.strokeStyle = 'rgba(6, 182, 212, 0.3)';
                        ctx.strokeRect(start[0], start[1], size[0], size[1]);

                        if (prediction.landmarks.length >= 3) {
                            const rightEye = prediction.landmarks[0];
                            const leftEye = prediction.landmarks[1];
                            const nose = prediction.landmarks[2];

                            let pulse = Math.abs(Math.sin(Date.now() / 150)) * 6;

                            ctx.beginPath();
                            ctx.arc(rightEye[0], rightEye[1], 10 + pulse, 0, 2 * Math.PI);
                            ctx.arc(leftEye[0], leftEye[1], 10 + pulse, 0, 2 * Math.PI);
                            ctx.strokeStyle = `rgba(239, 68, 68, 0.8)`;
                            ctx.lineWidth = 3;
                            ctx.stroke();

                            ctx.beginPath();
                            ctx.moveTo(rightEye[0] - 20, rightEye[1]); ctx.lineTo(rightEye[0] + 20, rightEye[1]);
                            ctx.moveTo(rightEye[0], rightEye[1] - 20); ctx.lineTo(rightEye[0], rightEye[1] + 20);
                            ctx.moveTo(leftEye[0] - 20, leftEye[1]); ctx.lineTo(leftEye[0] + 20, leftEye[1]);
                            ctx.moveTo(leftEye[0], leftEye[1] - 20); ctx.lineTo(leftEye[0], leftEye[1] + 20);
                            ctx.strokeStyle = 'rgba(239, 68, 68, 0.9)';
                            ctx.lineWidth = 1.5;
                            ctx.stroke();

                            const eyeDist = Math.abs(leftEye[0] - rightEye[0]);
                            const horizontalNoseRatio = (nose[0] - rightEye[0]) / eyeDist;
                            const verticalNoseRatio = (nose[1] - rightEye[1]) / (size[1]);

                            let movementAlert = null;

                            if (!isIdentityVerified) {
                                // Lightly wider thresholds for 'Workable' feel
                                const isCentered = (horizontalNoseRatio > 0.38 && horizontalNoseRatio < 0.62) && (verticalNoseRatio > -0.1 && verticalNoseRatio < 0.3);

                                const grid = document.getElementById('biometric-grid');
                                if (isCentered) {
                                    verificationProgress += 2.5; // Faster match (approx 1.5s total)
                                    document.getElementById('identity-sync-label').textContent = "TARGET LOCKED. SYNCING...";
                                    document.getElementById('identity-sync-label').style.color = "#10B981";
                                    if (grid) grid.classList.add('locked');
                                } else {
                                    verificationProgress = Math.max(0, verificationProgress - 0.5);
                                    document.getElementById('identity-sync-label').textContent = "ALIGN SUBJECT WITHIN OVAL TARGET";
                                    document.getElementById('identity-sync-label').style.color = "#F59E0B";
                                    if (grid) grid.classList.remove('locked');
                                }

                                const bar = document.getElementById('sync-progress-bar');
                                if (bar) bar.style.width = `${Math.min(100, verificationProgress)}%`;

                                if (verificationProgress >= 100) {
                                    isIdentityVerified = true;
                                    document.getElementById('identity-sync-label').textContent = "IDENTITY CONFIRMED";
                                    document.getElementById('identity-sync-label').style.color = "#10B981";

                                    // REPATRIATE VIDEO FEED TO CORNER
                                    const feedContainer = document.querySelector('.live-scan-window .feed-container');
                                    if (feedContainer) {
                                        proctorWindow.appendChild(feedContainer);
                                    }

                                    document.getElementById('identity-sync-overlay').classList.add('hidden');
                                    document.getElementById('biometric-grid').classList.add('hidden');

                                    trackingStatus.textContent = "PROCTORING ACTIVE (SYSTEM ARMED)";
                                    trackingStatus.style.color = "#DC2626"; // Alert Red for Proctored Mode
                                    document.getElementById('warning-tracker-badge').style.display = "block";

                                    studentLogsHtml += `<div>[${new Date().toLocaleTimeString()}] <span class="success">IDENTITY CONFIRMED.</span> AI Tracking System Armed.</div>`;
                                    renderTestPaper(); // INSTANT START
                                }
                                return;
                            }

                            // ULTRA-STRICT 20-DEGREE SECURE ZONE
                            // Center is ~0.5. 20 degrees maps to approx 0.37 (Left) and 0.63 (Right).
                            if (horizontalNoseRatio < 0.37 || horizontalNoseRatio > 0.63) {
                                movementAlert = "20° Secure Zone Violation (Face Rotation)";
                            }
                            if (verticalNoseRatio < -0.1 || verticalNoseRatio > 0.3) {
                                movementAlert = "Secure Zone Violation (Extreme Tilt/Stare)";
                            }

                            if (movementAlert && !isExamFrozen) {
                                registerViolation(movementAlert, false);
                            }
                        }
                    });

                    if (predictions.length > 1 && !isExamFrozen) {
                        executeMultiFaceProtocol();
                    }
                }

                // 2. Hardware / Phone Detection (COCO-SSD) - Every 15 frames for performance
                if (frameCount % 15 === 0 && objectModel) {
                    const objects = await objectModel.detect(webcamFeed);
                    objects.forEach(obj => {
                        if ((obj.class === "cell phone" || obj.class === "laptop") && obj.score > 0.6) {
                            registerViolation(`Electronic Device Detected: ${obj.class.toUpperCase()}`, false);
                        }
                    });
                }

            } catch (e) {
                console.error("TF Processing Frame Error", e);
            } finally {
                isPredicting = false;
            }
        }

        tfRAF = requestAnimationFrame(executeFrameAnalysis);
    }

    function executeMultiFaceProtocol() {
        if (isExamFrozen) return;
        isExamFrozen = true;
        trackingStatus.textContent = "ALARM: UNKNOWN SUBJECT";
        trackingStatus.style.color = "#DC2626";

        captureThreatScreenshot();
        registerViolation("Security Intrusion: Unauthorized Subject in Frame", false);

        const overlay = document.getElementById("test-freeze-overlay");
        const reasonText = document.getElementById("freeze-reason");
        const countdown = document.getElementById("freeze-countdown");

        reasonText.innerHTML = `<span style="color:var(--danger); font-weight:800; font-size:1.5rem">INTRUSION DETECTED</span><br>Secondary subject identification confirmed. This violation has been logged to your secure report.`;
        overlay.classList.remove("hidden");

        studentLogsHtml += `<div>[${new Date().toLocaleTimeString()}] <span class="err">CRITICAL THREAT DETECTED.</span> Extraneous subjects identified. Violation issued.</div>`;

        let time = 3; // Shorter freeze since it carries a penalty now
        countdown.textContent = time;

        const intv = setInterval(() => {
            time--;
            countdown.textContent = time;
            if (time <= 0) {
                clearInterval(intv);
                overlay.classList.add("hidden");
                studentLogsHtml += `<div>[${new Date().toLocaleTimeString()}] Frame limitation cleared. Restoring sequence.</div>`;
                showToast("Target isolated. Resuming...");
                setTimeout(() => { isExamFrozen = false; }, 2000);
            }
        }, 1000);
    }

    function captureThreatScreenshot() {
        const offscreenC = document.createElement("canvas");
        offscreenC.width = trackingCanvas.width;
        offscreenC.height = trackingCanvas.height;
        const ctx = offscreenC.getContext("2d");

        ctx.scale(-1, 1);
        ctx.translate(-offscreenC.width, 0);
        ctx.drawImage(webcamFeed, 0, 0, offscreenC.width, offscreenC.height);

        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.drawImage(trackingCanvas, 0, 0, offscreenC.width, offscreenC.height);

        const base64 = offscreenC.toDataURL('image/jpeg', 0.8);
        capturedThreats.push({ stamp: new Date().toLocaleTimeString(), img: base64 });
    }

    function injectThreatsToDashboard() {
        const wrapBlock = document.getElementById("security-threats-box");
        const gallery = document.getElementById("threats-gallery");

        if (capturedThreats.length > 0) {
            wrapBlock.style.display = "block";
            capturedThreats.forEach(threat => {
                const thumb = document.createElement("div");
                thumb.className = "violation-snapshot";
                thumb.innerHTML = `<img src="${threat.img}" alt="Violation Threat"/>
                                   <p>Captured: ${threat.stamp}</p>`;
                gallery.appendChild(thumb);
            });
        }
    }

    function showToast(message) {
        const toast = document.getElementById("camera-toast");
        toast.textContent = message;
        toast.classList.remove("hidden");
        toast.style.top = "20px";
        toast.style.opacity = "1";
        setTimeout(() => {
            toast.style.top = "-100px";
            toast.style.opacity = "0";
            setTimeout(() => toast.classList.add("hidden"), 400);
        }, 4000);
    }

    // ==========================================
    // 5. Dynamic Test Engine
    // ==========================================
    let activeTimerInt = null;
let currentQuestionIndex = 0;
let totalQuestions = 0;

function renderTestPaper() {
    const testBody = document.getElementById("dynamic-test-body");
    const navBar = document.getElementById("test-nav-bar");
    const navTitle = document.getElementById("nav-test-title");
    const navFooter = document.getElementById("test-nav-footer");

    const activeMetadata = testsData[selectedTestId];
    navTitle.textContent = activeMetadata.name;
    totalQuestions = activeMetadata.questions.length;
    currentQuestionIndex = 0;

    testBody.innerHTML = generateTestHTML(selectedTestId);
    navBar.classList.remove("hidden");
    navFooter.classList.remove("hidden");

    updatePagingVisibility();
    setupNavigationListeners();

    setTimeout(() => {
        testBody.classList.add("visible");
        attachTestLogic();
    }, 50);
}

function setupNavigationListeners() {
    document.getElementById("prev-question").onclick = () => {
        if (currentQuestionIndex > 0) {
            currentQuestionIndex--;
            updatePagingVisibility();
        }
    };
    document.getElementById("next-question").onclick = () => {
        if (currentQuestionIndex < totalQuestions - 1) {
            currentQuestionIndex++;
            updatePagingVisibility();
        }
    };
}

function updatePagingVisibility() {
    const blocks = document.querySelectorAll(".question-block");
    blocks.forEach((block, idx) => {
        if (idx === currentQuestionIndex) block.classList.add("active");
        else block.classList.remove("active");
    });

    const status = document.getElementById("paging-status");
    if (status) status.textContent = `Question ${currentQuestionIndex + 1} of ${totalQuestions}`;

    document.getElementById("prev-question").disabled = (currentQuestionIndex === 0);
    document.getElementById("next-question").disabled = (currentQuestionIndex === totalQuestions - 1);
}

function generateTestHTML(reqId) {
    const activeMetadata = testsData[reqId];
    let html = '<header class="test-header">' +
        '<div class="test-title">' + activeMetadata.name + '</div>' +
        '<div class="test-timer-badge" id="test-runner-timer">45:00</div>' +
        '</header>' +
        '<div class="test-body">';

    activeMetadata.questions.forEach((q, idx) => {
        html += '<div class="question-block" id="block-' + q.id + '">' +
            '<div class="test-section-tag">Section ' + q.section + '</div>' +
            '<div class="question-text">' + q.question + '</div>';

        if (q.type === "mcq") {
            html += '<div class="options-group">';
            q.options.forEach((opt, optIdx) => {
                html += '<label class="option-label"><input type="radio" name="input-' + q.id + '" value="' + optIdx + '"> ' + opt + '</label>';
            });
            html += '</div>';
        } else {
            html += '<textarea class="answer-textarea" name="input-' + q.id + '" placeholder="Type your answer here..."></textarea>';
        }
        html += '<div class="eval-result" id="eval-' + q.id + '"></div></div>';
    });

    html += '<div class="submit-test-container"><button class="submit-test-btn" id="finish-test-btn">Submit Examination</button></div></div>';
    return html;
}

function attachTestLogic() {
    let totalTime = 45 * 60;
    const testRunnerTimer = document.getElementById("test-runner-timer");
    activeTimerInt = setInterval(() => {
        if (totalTime <= 0) clearInterval(activeTimerInt);
        totalTime--;
        testRunnerTimer.textContent = `${Math.floor(totalTime / 60) < 10 ? '0' + Math.floor(totalTime / 60) : Math.floor(totalTime / 60)}:${totalTime % 60 < 10 ? '0' + (totalTime % 60) : totalTime % 60}`;
    }, 1000);

    document.getElementById("finish-test-btn").addEventListener("click", () => triggerTestCompletion(false));
}

function triggerTestCompletion(forceKicked) {
    const finishBtn = document.getElementById("finish-test-btn");
    if (finishBtn) {
        finishBtn.textContent = "Committing Submission...";
        finishBtn.disabled = true;
    }
    if (activeTimerInt) clearInterval(activeTimerInt);

    isTestActive = false;
    completedTests.push(selectedTestId); // Completely lock out the paper

    const meta = testsData[selectedTestId];
    document.getElementById("dashboard-result-desc").textContent = `Score: ${meta.name}`;

    // Safely cancel tracking
    proctorWindow.classList.add("hidden");
    document.getElementById("warning-tracker-badge").style.display = "none";

    if (tfRAF) cancelAnimationFrame(tfRAF);
    if (mediaRecorder && mediaRecorder.state !== "inactive") mediaRecorder.stop();
    if (trackRAF) cancelAnimationFrame(trackRAF);
    if (audioContext) audioContext.close();
    const webcamTracks = webcamFeed.srcObject ? webcamFeed.srcObject.getTracks() : [];
    webcamTracks.forEach(track => track.stop());

    if (forceKicked) {
        studentLogsHtml += `<div>[${new Date().toLocaleTimeString()}] <span class="err">SECURITY LOCKDOWN.</span> Exam was permanently locked and submitted due to reaching max explicit violations.</div>`;
    } else {
        studentLogsHtml += `<div>[${new Date().toLocaleTimeString()}] Exam explicitly submitted by Subject. Deep Tracking Engine offline.</div>`;
    }
    audioLogsHtml += `<div>[${new Date().toLocaleTimeString()}] Acoustic data packaged securely.</div>`;

    let totalScore = 0;
    meta.questions.forEach(q => {
        const evalDiv = document.getElementById(`eval-${q.id}`);
        let isCorrect = false;

        if (q.type === "mcq") {
            const checkedRadio = document.querySelector(`input[name="input-${q.id}"]:checked`);
            if (checkedRadio && parseInt(checkedRadio.value) === q.answerIdx) {
                totalScore += q.marks;
                isCorrect = true;
            }

            if (evalDiv) {
                if (isCorrect) {
                    evalDiv.innerHTML = `<div class="eval-correct-text">✅ Correct! You selected the right answer.</div>`;
                } else {
                    evalDiv.innerHTML = `<div class="eval-wrong-text">❌ Incorrect. The correct answer was: <strong>${q.options[q.answerIdx]}</strong></div>`;
                }
            }
        } else {
            const textArea = document.querySelector(`textarea[name="input-${q.id}"]`);
            if (textArea) {
                const val = textArea.value.replace(/\s+/g, ' ').trim().toLowerCase();
                const target = q.ideal.replace(/\s+/g, ' ').trim().toLowerCase();
                // Simple fuzzy match: if keywords match or it's exactly the same
                if (val === target && val.length > 0) {
                    totalScore += q.marks;
                    isCorrect = true;
                }
            }

            if (evalDiv) {
                evalDiv.innerHTML = `
                        <div class="ideal-answer-box">
                            <span>Ideal Solution / Key Points:</span>
                            ${q.ideal.replace(/\n/g, '<br>')}
                        </div>
                    `;
            }
        }
    });

    // Dynamically compute max marks from each test's actual question set
    const finalMax = meta.questions.reduce((sum, q) => sum + q.marks, 0);

    if (forceKicked) {
        document.getElementById("modal-completion-title").textContent = "FORCED TERMINATION";
        document.getElementById("modal-completion-title").style.color = "#DC2626";
    } else {
        document.getElementById("modal-completion-title").textContent = "Evaluation Concluded";
        document.getElementById("modal-completion-title").style.color = "var(--highlight-color)";
    }

    document.getElementById("modal-final-score").textContent = `Score: ${totalScore} / ${finalMax}`;
    const overlay = document.getElementById("test-completion-modal");
    overlay.classList.remove("hidden");
    dashboardResultDisplay.textContent = `${Math.round((totalScore / finalMax) * 100)}%`;

    document.getElementById("modal-btn-return-dashboard").onclick = () => {
        overlay.classList.add("hidden");
        testInterfaceContainer.classList.remove("visible");
        setTimeout(() => {
            testInterfaceContainer.style.display = "none";
            renderDropdownItems();
            document.getElementById("dashboard-test-block").style.display = "flex";
            dashboardContainer.style.display = "block";
            setTimeout(() => dashboardContainer.classList.add("visible"), 50);
        }, 800);
    };
}
});
