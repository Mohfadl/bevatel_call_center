const API =
    '/api';


let token =
    localStorage.getItem(
        'bevatel_token',
    );


let currentUserEmail =
    localStorage.getItem(
        'bevatel_email',
    );


let conversations =
    [];


let channels =
    [];


let labels =
    [];


let selectedConversation =
    null;


let selectedChannelId =
    null;


let assignmentFilter =
    'unassigned';


let sidebarFilter =
    'all';


/*
|--------------------------------------------------------------------------
| DOM Helpers
|--------------------------------------------------------------------------
*/

function element(
    id,
) {
    return document
        .getElementById(
            id,
        );
}


function escapeHtml(
    value,
) {
    const div =
        document
            .createElement(
                'div',
            );

    div.textContent =
        value ??
        '';

    return div.innerHTML;
}


function initials(
    name,
) {
    const safeName =
        String(
            name ??
            '',
        )
            .trim();


    if (!safeName) {
        return '?';
    }


    const parts =
        safeName
            .split(/\s+/)
            .filter(Boolean);


    if (
        parts.length ===
        1
    ) {
        return parts[0]
            .substring(
                0,
                2,
            )
            .toUpperCase();
    }


    return (
        parts[0][0] +
        parts[1][0]
    ).toUpperCase();
}


function formatDate(
    value,
) {
    if (!value) {
        return '';
    }


    const date =
        new Date(
            value,
        );


    if (
        Number.isNaN(
            date.getTime(),
        )
    ) {
        return '';
    }


    const now =
        new Date();


    const diff =
        now.getTime() -
        date.getTime();


    const minutes =
        Math.floor(
            diff /
            60000,
        );


    const hours =
        Math.floor(
            diff /
            3600000,
        );


    const days =
        Math.floor(
            diff /
            86400000,
        );


    if (
        minutes <
        1
    ) {
        return 'now';
    }


    if (
        minutes <
        60
    ) {
        return `${minutes}m`;
    }


    if (
        hours <
        24
    ) {
        return `${hours}h`;
    }


    if (
        days <
        30
    ) {
        return `${days}d`;
    }


    return date
        .toLocaleDateString();
}


function formatMessageTime(
    value,
) {
    if (!value) {
        return '';
    }


    const date =
        new Date(
            value,
        );


    return date
        .toLocaleTimeString(
            [],
            {
                hour:
                    '2-digit',

                minute:
                    '2-digit',
            },
        );
}


function toast(
    message,
    type =
        '',
) {
    const container =
        element(
            'toast-container',
        );


    const item =
        document
            .createElement(
                'div',
            );


    item.className =
        `toast ${type}`;


    item.textContent =
        message;


    container
        .appendChild(
            item,
        );


    setTimeout(
        () => {
            item.remove();
        },
        3500,
    );
}


/*
|--------------------------------------------------------------------------
| API
|--------------------------------------------------------------------------
*/

function authHeaders() {
    return {
        'Content-Type':
            'application/json',

        Authorization:
            `Bearer ${token}`,
    };
}


async function api(
    url,
    options =
        {},
) {
    const response =
        await fetch(
            `${API}${url}`,
            {
                ...options,

                headers: {
                    ...authHeaders(),

                    ...(
                        options.headers ??
                        {}
                    ),
                },
            },
        );


    let result;


    try {
        result =
            await response.json();
    } catch {
        result = {};
    }


    if (
        response.status ===
        401
    ) {
        logout();

        throw new Error(
            'Session expired',
        );
    }


    if (
        !response.ok
    ) {
        throw new Error(
            result.message ??
            'Request failed',
        );
    }


    return result;
}


/*
|--------------------------------------------------------------------------
| Extract API Collections
|--------------------------------------------------------------------------
*/

function extractCollection(
    result,
    key,
) {
    if (
        Array.isArray(
            result,
        )
    ) {
        return result;
    }


    if (
        Array.isArray(
            result?.data,
        )
    ) {
        return result.data;
    }


    if (
        Array.isArray(
            result?.[key],
        )
    ) {
        return result[key];
    }


    if (
        Array.isArray(
            result?.data?.[key],
        )
    ) {
        return result.data[key];
    }


    if (
        Array.isArray(
            result?.data?.data,
        )
    ) {
        return result.data.data;
    }


    return [];
}


/*
|--------------------------------------------------------------------------
| Login
|--------------------------------------------------------------------------
*/

element(
    'login-form',
)
    .addEventListener(
        'submit',

        async event => {
            event.preventDefault();


            const button =
                element(
                    'login-button',
                );


            element(
                'login-error',
            ).textContent =
                '';


            button.disabled =
                true;


            button.textContent =
                'Logging in...';


            try {
                const response =
                    await fetch(
                        `${API}/auth/login`,
                        {
                            method:
                                'POST',

                            headers: {
                                'Content-Type':
                                    'application/json',
                            },

                            body:
                                JSON.stringify({
                                    organizationId:
                                        element(
                                            'organization-id',
                                        ).value
                                            .trim(),

                                    email:
                                        element(
                                            'email',
                                        ).value
                                            .trim(),

                                    password:
                                        element(
                                            'password',
                                        ).value,
                                }),
                        },
                    );


                const result =
                    await response
                        .json();


                if (
                    !response.ok
                ) {
                    throw new Error(
                        result.message ??
                        'Login failed',
                    );
                }


                token =
                    result.token ??
                    result.accessToken ??
                    result.data?.token ??
                    result.data?.accessToken;


                if (!token) {
                    throw new Error(
                        'Login response does not contain token',
                    );
                }


                currentUserEmail =
                    element(
                        'email',
                    ).value
                        .trim();


                localStorage
                    .setItem(
                        'bevatel_token',
                        token,
                    );


                localStorage
                    .setItem(
                        'bevatel_email',
                        currentUserEmail,
                    );


                showApp();
            } catch (
                error
            ) {
                element(
                    'login-error',
                ).textContent =
                    error.message;
            } finally {
                button.disabled =
                    false;


                button.textContent =
                    'Login';
            }
        },
    );


function logout() {
    token =
        null;


    selectedConversation =
        null;


    localStorage
        .removeItem(
            'bevatel_token',
        );


    localStorage
        .removeItem(
            'bevatel_email',
        );


    element(
        'app-screen',
    )
        .classList
        .add(
            'hidden',
        );


    element(
        'login-screen',
    )
        .classList
        .remove(
            'hidden',
        );
}


element(
    'logout-button',
)
    .addEventListener(
        'click',
        logout,
    );


/*
|--------------------------------------------------------------------------
| App
|--------------------------------------------------------------------------
*/

async function showApp() {
    element(
        'login-screen',
    )
        .classList
        .add(
            'hidden',
        );


    element(
        'app-screen',
    )
        .classList
        .remove(
            'hidden',
        );


    element(
        'current-user-email',
    ).textContent =
        currentUserEmail ??
        'Agent';


    await refreshAll();
}


async function refreshAll() {
    await Promise
        .allSettled([
            loadChannels(),
            loadLabels(),
            loadConversations(),
        ]);
}


element(
    'refresh-button',
)
    .addEventListener(
        'click',

        async () => {
            await refreshAll();

            toast(
                'Inbox refreshed',
                'success',
            );
        },
    );


/*
|--------------------------------------------------------------------------
| Channels
|--------------------------------------------------------------------------
*/

async function loadChannels() {
    try {
        const result =
            await api(
                '/meta/accounts',
            );


        channels =
            extractCollection(
                result,
                'accounts',
            );


        renderChannels();
    } catch (
        error
    ) {
        console.error(
            error,
        );


        element(
            'channels-sidebar-list',
        ).innerHTML =
            `
                <div class="sidebar-placeholder">
                    Failed to load channels
                </div>
            `;
    }
}


function channelIcon(
    channel,
) {
    switch (
        channel
    ) {
        case 'WHATSAPP':
            return {
                text:
                    'W',

                className:
                    'whatsapp',
            };


        case 'FACEBOOK':
            return {
                text:
                    'F',

                className:
                    'facebook',
            };


        case 'INSTAGRAM':
            return {
                text:
                    'I',

                className:
                    'instagram',
            };


        default:
            return {
                text:
                    '#',

                className:
                    'other',
            };
    }
}


function renderChannels() {
    const container =
        element(
            'channels-sidebar-list',
        );


    if (
        channels.length ===
        0
    ) {
        container.innerHTML =
            `
                <div class="sidebar-placeholder">
                    No channels connected
                </div>
            `;

        return;
    }


    container.innerHTML =
        channels
            .map(
                channel => {
                    const icon =
                        channelIcon(
                            channel.channel,
                        );


                    return `
                        <button
                            class="channel-sidebar-item"
                            data-channel-id="${escapeHtml(
                                channel.id,
                            )}"
                        >

                            <span
                                class="
                                    channel-sidebar-icon
                                    ${icon.className}
                                "
                            >
                                ${icon.text}
                            </span>

                            <span
                                class="channel-sidebar-name"
                            >
                                ${escapeHtml(
                                    channel.name,
                                )}
                            </span>

                        </button>
                    `;
                },
            )
            .join(
                '',
            );


    container
        .querySelectorAll(
            '.channel-sidebar-item',
        )
        .forEach(
            button => {
                button
                    .addEventListener(
                        'click',

                        () => {
                            selectChannel(
                                button.dataset
                                    .channelId,
                            );
                        },
                    );
            },
        );
}


function selectChannel(
    channelId,
) {
    selectedChannelId =
        channelId;


    const channel =
        channels
            .find(
                item =>
                    item.id ===
                    channelId,
            );


    document
        .querySelectorAll(
            '.channel-sidebar-item',
        )
        .forEach(
            item => {
                item.classList
                    .toggle(
                        'active',
                        item.dataset
                            .channelId ===
                        channelId,
                    );
            },
        );


    if (channel) {
        element(
            'selected-channel-name',
        ).textContent =
            channel.name;


        element(
            'selected-channel-type',
        ).textContent =
            channel.channel;
    }


    renderConversations();
}


/*
|--------------------------------------------------------------------------
| Labels
|--------------------------------------------------------------------------
*/

async function loadLabels() {
    try {
        const result =
            await api(
                '/labels',
            );


        labels =
            extractCollection(
                result,
                'labels',
            );


        renderLabels();
    } catch (
        error
    ) {
        console.error(
            error,
        );
    }
}


function renderLabels() {
    const container =
        element(
            'labels-sidebar-list',
        );


    container.innerHTML =
        labels
            .slice(
                0,
                10,
            )
            .map(
                label => `
                    <div
                        class="label-sidebar-item"
                    >
                        <span
                            class="label-dot"
                        ></span>

                        ${escapeHtml(
                            label.name ??
                            label.title ??
                            'Label',
                        )}
                    </div>
                `,
            )
            .join(
                '',
            );
}


/*
|--------------------------------------------------------------------------
| Conversations
|--------------------------------------------------------------------------
*/

async function loadConversations() {
    try {
        const result =
            await api(
                '/conversations',
            );


        conversations =
            extractCollection(
                result,
                'conversations',
            );


        updateConversationCounters();

        renderConversations();
    } catch (
        error
    ) {
        console.error(
            error,
        );


        element(
            'conversations-list',
        ).innerHTML =
            `
                <div class="empty-list">
                    ${escapeHtml(
                        error.message,
                    )}
                </div>
            `;
    }
}


function updateConversationCounters() {
    element(
        'all-conversations-count',
    ).textContent =
        conversations.length;


    const unassigned =
        conversations
            .filter(
                conversation =>
                    !conversation
                        .assignedUserId,
            );


    element(
        'unassigned-count',
    ).textContent =
        unassigned.length;


    element(
        'queue-all-count',
    ).textContent =
        conversations.length;


    const mine =
        conversations
            .filter(
                conversation =>
                    Boolean(
                        conversation
                            .assignedUserId,
                    ),
            );


    element(
        'mine-count',
    ).textContent =
        mine.length;
}


function getFilteredConversations() {
    let data =
        [
            ...conversations,
        ];


    /*
    |--------------------------------------------------------------------------
    | Channel
    |--------------------------------------------------------------------------
    */

    if (
        selectedChannelId
    ) {
        data =
            data.filter(
                conversation =>
                    conversation
                        .channelAccountId ===
                    selectedChannelId,
            );
    }


    /*
    |--------------------------------------------------------------------------
    | Assignment
    |--------------------------------------------------------------------------
    */

    if (
        assignmentFilter ===
        'unassigned'
    ) {
        data =
            data.filter(
                conversation =>
                    !conversation
                        .assignedUserId,
            );
    }


    /*
    |--------------------------------------------------------------------------
    | Status
    |--------------------------------------------------------------------------
    */

    const status =
        element(
            'status-filter',
        ).value;


    if (status) {
        data =
            data.filter(
                conversation =>
                    conversation
                        .status ===
                    status,
            );
    }


    /*
    |--------------------------------------------------------------------------
    | Search
    |--------------------------------------------------------------------------
    */

    const search =
        element(
            'conversation-search-input',
        ).value
            .trim()
            .toLowerCase();


    if (search) {
        data =
            data.filter(
                conversation => {
                    const haystack =
                        [
                            conversation
                                .contact
                                ?.displayName,

                            conversation
                                .contact
                                ?.phone,

                            conversation
                                .subject,

                            conversation
                                .messages?.[0]
                                ?.body,
                        ]
                            .filter(
                                Boolean,
                            )
                            .join(
                                ' ',
                            )
                            .toLowerCase();


                    return haystack
                        .includes(
                            search,
                        );
                },
            );
    }


    /*
    |--------------------------------------------------------------------------
    | Sort
    |--------------------------------------------------------------------------
    */

    const sort =
        element(
            'sort-filter',
        ).value;


    data.sort(
        (
            first,
            second,
        ) => {
            const a =
                new Date(
                    first.lastMessageAt ??
                    first.createdAt,
                )
                    .getTime();


            const b =
                new Date(
                    second.lastMessageAt ??
                    second.createdAt,
                )
                    .getTime();


            if (
                sort ===
                'oldest'
            ) {
                return a - b;
            }


            return b - a;
        },
    );


    return data;
}


function renderConversations() {
    const container =
        element(
            'conversations-list',
        );


    const data =
        getFilteredConversations();


    if (
        data.length ===
        0
    ) {
        container.innerHTML =
            `
                <div class="empty-list">
                    No conversations found
                </div>
            `;

        return;
    }


    container.innerHTML =
        data
            .map(
                conversation => {
                    const contact =
                        conversation
                            .contact ??
                        {};


                    const name =
                        contact.displayName ??
                        contact.phone ??
                        'Unknown contact';


                    const message =
                        conversation
                            .messages?.[0]
                            ?.body ??
                        conversation
                            .subject ??
                        'No messages yet';


                    const active =
                        selectedConversation
                            ?.id ===
                        conversation.id;


                    return `
                        <button
                            class="
                                conversation-item
                                ${
                                    active
                                        ? 'active'
                                        : ''
                                }
                            "
                            data-conversation-id="${escapeHtml(
                                conversation.id,
                            )}"
                        >

                            <div
                                class="conversation-avatar"
                            >
                                ${escapeHtml(
                                    initials(
                                        name,
                                    ),
                                )}
                            </div>


                            <div
                                class="conversation-content"
                            >

                                <div
                                    class="conversation-row"
                                >

                                    <span
                                        class="conversation-name"
                                    >
                                        ${escapeHtml(
                                            name,
                                        )}
                                    </span>

                                    <span
                                        class="conversation-time"
                                    >
                                        ${escapeHtml(
                                            formatDate(
                                                conversation
                                                    .lastMessageAt ??
                                                conversation
                                                    .createdAt,
                                            ),
                                        )}
                                    </span>

                                </div>


                                <div
                                    class="conversation-preview-row"
                                >

                                    <span
                                        class="conversation-channel-mini"
                                    >
                                        ↩
                                    </span>

                                    <span
                                        class="conversation-preview"
                                    >
                                        ${escapeHtml(
                                            message,
                                        )}
                                    </span>

                                </div>

                            </div>

                        </button>
                    `;
                },
            )
            .join(
                '',
            );


    container
        .querySelectorAll(
            '.conversation-item',
        )
        .forEach(
            button => {
                button
                    .addEventListener(
                        'click',

                        () => {
                            openConversation(
                                button.dataset
                                    .conversationId,
                            );
                        },
                    );
            },
        );
}


/*
|--------------------------------------------------------------------------
| Conversation Details
|--------------------------------------------------------------------------
*/

async function openConversation(
    conversationId,
) {
    try {
        const result =
            await api(
                `/conversations/${conversationId}`,
            );


        selectedConversation =
            result.data ??
            result.conversation ??
            result;


        renderActiveConversation();


        renderConversations();
    } catch (
        error
    ) {
        toast(
            error.message,
            'error',
        );
    }
}


function renderActiveConversation() {
    if (
        !selectedConversation
    ) {
        return;
    }


    element(
        'empty-chat',
    )
        .classList
        .add(
            'hidden',
        );


    element(
        'active-chat',
    )
        .classList
        .remove(
            'hidden',
        );


    const contact =
        selectedConversation
            .contact ??
        {};


    const name =
        contact.displayName ??
        contact.phone ??
        'Unknown Contact';


    const avatar =
        initials(
            name,
        );


    element(
        'chat-contact-name',
    ).textContent =
        name;


    element(
        'chat-avatar',
    ).textContent =
        avatar;


    element(
        'details-avatar',
    ).textContent =
        avatar;


    element(
        'chat-channel',
    ).textContent =
        selectedConversation
            .channel ??
        '';


    element(
        'chat-contact-phone',
    ).textContent =
        contact.phone ??
        '';


    element(
        'conversation-status',
    ).value =
        selectedConversation
            .status ??
        'OPEN';


    /*
    |--------------------------------------------------------------------------
    | Details panel
    |--------------------------------------------------------------------------
    */

    element(
        'details-name',
    ).textContent =
        name;


    element(
        'details-status',
    ).textContent =
        contact.status ??
        'ACTIVE';


    element(
        'details-phone',
    ).textContent =
        contact.phone ??
        '-';


    element(
        'details-email',
    ).textContent =
        contact.email ??
        '-';


    element(
        'details-company',
    ).textContent =
        contact.company ??
        '-';


    element(
        'details-channel',
    ).textContent =
        selectedConversation
            .channel ??
        '-';


    renderConversationLabels();

    renderMessages();
}


function renderConversationLabels() {
    const container =
        element(
            'conversation-labels',
        );


    const items =
        selectedConversation
            ?.labels ??
        [];


    if (
        items.length ===
        0
    ) {
        container.innerHTML =
            `
                <span
                    style="
                        color:#98a2b3;
                        font-size:10px;
                    "
                >
                    No labels
                </span>
            `;

        return;
    }


    container.innerHTML =
        items
            .map(
                item => {
                    const label =
                        item.label ??
                        item;


                    return `
                        <span
                            class="conversation-label"
                        >
                            ${escapeHtml(
                                label.name ??
                                label.title ??
                                'Label',
                            )}
                        </span>
                    `;
                },
            )
            .join(
                '',
            );
}


/*
|--------------------------------------------------------------------------
| Messages
|--------------------------------------------------------------------------
*/

function renderMessages() {
    const container =
        element(
            'messages-container',
        );


    const messages =
        selectedConversation
            ?.messages ??
        [];


    if (
        messages.length ===
        0
    ) {
        container.innerHTML =
            `
                <div
                    style="
                        padding:40px;
                        text-align:center;
                        color:#98a2b3;
                        font-size:11px;
                    "
                >
                    No messages yet
                </div>
            `;

        return;
    }


    container.innerHTML =
        messages
            .map(
                message => {
                    const direction =
                        message.direction ===
                        'OUTBOUND'
                            ? 'outbound'
                            : 'inbound';


                    return `
                        <div
                            class="
                                message-row
                                ${direction}
                            "
                        >

                            <div
                                class="message-bubble"
                            >

                                <div
                                    class="message-text"
                                >
                                    ${escapeHtml(
                                        message.body ??
                                        `[${message.type}]`,
                                    )}
                                </div>

                                <div
                                    class="message-meta"
                                >

                                    <span>
                                        ${escapeHtml(
                                            formatMessageTime(
                                                message.createdAt,
                                            ),
                                        )}
                                    </span>

                                    ${
                                        direction ===
                                        'outbound'
                                            ? `
                                                <span
                                                    class="message-status"
                                                >
                                                    ${getMessageStatusIcon(
                                                        message.status,
                                                    )}
                                                </span>
                                            `
                                            : ''
                                    }

                                </div>

                            </div>

                        </div>
                    `;
                },
            )
            .join(
                '',
            );


    container.scrollTop =
        container.scrollHeight;
}


function getMessageStatusIcon(
    status,
) {
    switch (
        status
    ) {
        case 'READ':
            return '✓✓';

        case 'DELIVERED':
            return '✓✓';

        case 'SENT':
            return '✓';

        case 'FAILED':
            return '⚠';

        case 'QUEUED':
            return '◷';

        default:
            return '';
    }
}


/*
|--------------------------------------------------------------------------
| Send Message
|--------------------------------------------------------------------------
*/

element(
    'message-form',
)
    .addEventListener(
        'submit',

        async event => {
            event.preventDefault();


            if (
                !selectedConversation
            ) {
                return;
            }


            const input =
                element(
                    'message-input',
                );


            const body =
                input.value
                    .trim();


            if (!body) {
                return;
            }


            const button =
                element(
                    'send-message-button',
                );


            button.disabled =
                true;


            input.disabled =
                true;


            try {
                await api(
                    `/meta/conversations/${selectedConversation.id}/messages`,
                    {
                        method:
                            'POST',

                        body:
                            JSON.stringify({
                                type:
                                    'TEXT',

                                body,
                            }),
                    },
                );


                input.value =
                    '';


                await openConversation(
                    selectedConversation.id,
                );


                await loadConversations();


                toast(
                    'Message sent',
                    'success',
                );
            } catch (
                error
            ) {
                toast(
                    error.message,
                    'error',
                );
            } finally {
                button.disabled =
                    false;


                input.disabled =
                    false;


                input.focus();
            }
        },
    );


/*
|--------------------------------------------------------------------------
| Search
|--------------------------------------------------------------------------
*/

let searchTimer;


element(
    'conversation-search-input',
)
    .addEventListener(
        'input',

        () => {
            clearTimeout(
                searchTimer,
            );


            searchTimer =
                setTimeout(
                    renderConversations,
                    250,
                );
        },
    );


/*
|--------------------------------------------------------------------------
| Status / Sort Filters
|--------------------------------------------------------------------------
*/

element(
    'status-filter',
)
    .addEventListener(
        'change',
        renderConversations,
    );


element(
    'sort-filter',
)
    .addEventListener(
        'change',
        renderConversations,
    );


/*
|--------------------------------------------------------------------------
| Assignment Tabs
|--------------------------------------------------------------------------
*/

document
    .querySelectorAll(
        '.assignment-tab',
    )
    .forEach(
        button => {
            button
                .addEventListener(
                    'click',

                    () => {
                        assignmentFilter =
                            button.dataset
                                .assignmentFilter;


                        document
                            .querySelectorAll(
                                '.assignment-tab',
                            )
                            .forEach(
                                item =>
                                    item
                                        .classList
                                        .remove(
                                            'active',
                                        ),
                            );


                        button
                            .classList
                            .add(
                                'active',
                            );


                        renderConversations();
                    },
                );
        },
    );


/*
|--------------------------------------------------------------------------
| Main Sidebar Filters
|--------------------------------------------------------------------------
*/

document
    .querySelectorAll(
        '.sidebar-item',
    )
    .forEach(
        button => {
            button
                .addEventListener(
                    'click',

                    () => {
                        sidebarFilter =
                            button.dataset
                                .inboxFilter;


                        document
                            .querySelectorAll(
                                '.sidebar-item',
                            )
                            .forEach(
                                item =>
                                    item
                                        .classList
                                        .remove(
                                            'active',
                                        ),
                            );


                        button
                            .classList
                            .add(
                                'active',
                            );


                        /*
                        | For now only "all" is connected to API.
                        |
                        | Mentions, unattended and chatbot should later
                        | have backend filters/endpoints.
                        */

                        selectedChannelId =
                            null;


                        document
                            .querySelectorAll(
                                '.channel-sidebar-item',
                            )
                            .forEach(
                                item =>
                                    item
                                        .classList
                                        .remove(
                                            'active',
                                        ),
                            );


                        element(
                            'selected-channel-name',
                        ).textContent =
                            button
                                .textContent
                                .trim();


                        element(
                            'selected-channel-type',
                        ).textContent =
                            'All';


                        renderConversations();
                    },
                );
        },
    );


/*
|--------------------------------------------------------------------------
| Contact Details
|--------------------------------------------------------------------------
*/

element(
    'contact-info-button',
)
    .addEventListener(
        'click',

        () => {
            element(
                'contact-details-panel',
            )
                .classList
                .toggle(
                    'hidden',
                );
        },
    );


element(
    'close-contact-info',
)
    .addEventListener(
        'click',

        () => {
            element(
                'contact-details-panel',
            )
                .classList
                .add(
                    'hidden',
                );
        },
    );


/*
|--------------------------------------------------------------------------
| Filter Toggle
|--------------------------------------------------------------------------
*/

element(
    'filter-toggle',
)
    .addEventListener(
        'click',

        () => {
            element(
                'conversation-filters',
            )
                .classList
                .toggle(
                    'hidden',
                );
        },
    );


/*
|--------------------------------------------------------------------------
| Start Existing Session
|--------------------------------------------------------------------------
*/

if (token) {
    showApp();
}