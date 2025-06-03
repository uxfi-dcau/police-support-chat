const database = firebase.database();

// Variables globales
let currentUser = null;
let currentChannel = null;
let channels = {};
let messagesListener = null;
let channelStatusListener = null;

// Éléments DOM
const loginModal = document.getElementById('login-modal');
const usernameInput = document.getElementById('username');
const userTypeSelect = document.getElementById('user-type');
const loginButton = document.getElementById('login-button');
const channelsList = document.getElementById('channels-list');
const currentUserDiv = document.getElementById('current-user');
const channelNameHeader = document.getElementById('channel-name');
const messagesContainer = document.getElementById('messages-container');
const messageInput = document.getElementById('message-input');
const sendButton = document.getElementById('send-button');
const locationButton = document.getElementById('location-button');
const disconnectModal = document.getElementById('disconnect-modal');

// Gestion de la connexion
loginButton.addEventListener('click', () => {
    const username = usernameInput.value.trim();
    const userType = userTypeSelect.value;
    
    if (username.length < 3) {
        alert('Le nom d\'utilisateur doit contenir au moins 3 caractères');
        return;
    }
    
    currentUser = {
        id: Date.now().toString(),
        username: username,
        type: userType
    };
    
    // Sauvegarder l'utilisateur dans Firebase
    database.ref(`users/${currentUser.id}`).set(currentUser);
    
    // Masquer la modal et initialiser l'app
    loginModal.classList.add('hidden');
    initializeApp();
});

// Initialiser l'application après connexion
function initializeApp() {
    // Afficher les infos utilisateur
    currentUserDiv.innerHTML = `
        <div style="display: flex; align-items: center;">
            <div class="message-avatar" style="width: 32px; height: 32px; margin-right: 8px;">
                ${currentUser.username.charAt(0).toUpperCase()}
            </div>
            <div>
                <div style="font-weight: 600;">${currentUser.username}</div>
                <div style="font-size: 12px; color: #b9bbbe;">
                    ${currentUser.type === 'police' ? 'Policier' : 'Victime'}
                </div>
            </div>
        </div>
    `;
    
    // Afficher le bouton de localisation seulement pour les victimes
    if (currentUser.type === 'victim') {
        locationButton.style.display = 'block';
    }
    
    // Charger les canaux
    loadChannels();
    
    // Si c'est une victime, créer automatiquement son canal et surveiller son statut
    if (currentUser.type === 'victim') {
        createVictimChannel();
        monitorVictimChannel();
    }
}

// Surveiller le statut du canal de la victime
function monitorVictimChannel() {
    const channelId = `victim-${currentUser.id}`;
    let isFirstCheck = true;
    
    channelStatusListener = database.ref(`channels/${channelId}`).on('value', (snapshot) => {
        const channel = snapshot.val();
        
        // Ignorer la première vérification (quand le canal n'est pas encore créé)
        if (isFirstCheck) {
            isFirstCheck = false;
            return;
        }
        
        // Si le canal n'existe plus ET qu'on n'est pas en train de se connecter
        if (!channel && !loginModal.classList.contains('hidden')) {
            return;
        }
        
        // Si le canal a été supprimé après la connexion
        if (!channel) {
            showDisconnectModal();
        }
    });
}

// Afficher la modal de déconnexion
function showDisconnectModal() {
    disconnectModal.classList.add('show');   // au lieu de remove('hidden')
    
    /* On coupe les listeners, etc. */
    if (messagesListener) {
        database.ref(`messages/${currentChannel}`).off('value', messagesListener);
    }
    if (channelStatusListener) {
        database.ref(`channels/victim-${currentUser.id}`).off('value', channelStatusListener);
    }
}

// Charger les canaux disponibles
function loadChannels() {
    database.ref('channels').on('value', (snapshot) => {
        channels = snapshot.val() || {};
        displayChannels();
    });
}

// Créer un canal pour une victime
function createVictimChannel() {
    const channelId = `victim-${currentUser.id}`;
    const channelData = {
        id: channelId,
        name: `Victime - ${currentUser.username}`,
        type: 'victim',
        victimId: currentUser.id,
        createdAt: Date.now(),
        archived: false
    };
    
    database.ref(`channels/${channelId}`).set(channelData);
}

// Afficher les canaux
function displayChannels() {
    channelsList.innerHTML = '';
    
    // Canal police uniquement
    if (currentUser.type === 'police') {
        const policeChannel = document.createElement('div');
        policeChannel.className = 'channel police-only';
        policeChannel.innerHTML = '<i class="fas fa-lock"></i> Police uniquement';
        policeChannel.onclick = () => selectChannel('police-only', 'Police uniquement');
        channelsList.appendChild(policeChannel);
    }
    
    // Canaux des victimes
    Object.values(channels).forEach(channel => {
        if (channel.id === 'police-only') return;
        
        // Les victimes ne voient que leur propre canal
        if (currentUser.type === 'victim' && channel.victimId !== currentUser.id) {
            return;
        }
        
        if (currentUser.type === 'police') {
            // Vue policier avec contrôles
            const channelElement = document.createElement('div');
            channelElement.className = 'channel-with-controls';
            if (currentChannel === channel.id) {
                channelElement.classList.add('active');
            }
            if (channel.archived) {
                channelElement.classList.add('channel-archived');
            }
            
            channelElement.innerHTML = `
                <div class="channel-info" onclick="selectChannel('${channel.id}', '${channel.name}')">
                    <i class="fas fa-hashtag"></i> ${channel.name}
                </div>
                <div class="channel-controls">
                    ${!channel.archived ? 
                        `<button class="control-btn archive-btn" onclick="event.stopPropagation(); archiveChannel('${channel.id}')">
                            <i class="fas fa-archive"></i>
                        </button>` : 
                        `<button class="control-btn delete-btn" onclick="event.stopPropagation(); deleteChannel('${channel.id}')">
                            <i class="fas fa-trash"></i>
                        </button>`
                    }
                </div>
            `;
            
            channelsList.appendChild(channelElement);
        } else {
            // Vue victime simple
            const channelElement = document.createElement('div');
            channelElement.className = 'channel';
            if (currentChannel === channel.id) {
                channelElement.classList.add('active');
            }
            channelElement.innerHTML = `<i class="fas fa-hashtag"></i> ${channel.name}`;
            channelElement.onclick = () => selectChannel(channel.id, channel.name);
            channelsList.appendChild(channelElement);
        }
    });
}

// Archiver un canal
function archiveChannel(channelId) {
    if (confirm('Êtes-vous sûr de vouloir archiver ce canal ?')) {
        // Marquer le canal comme archivé
        database.ref(`channels/${channelId}/archived`).set(true);
        
        // Envoyer le message d'archivage
        const archiveMessage = {
            id: Date.now().toString(),
            type: 'system',
            text: 'Vous ne présentez plus aucune utilité pour la police. Bonne chance !',
            author: 'Système',
            authorType: 'system',
            timestamp: Date.now()
        };
        
        database.ref(`messages/${channelId}/${archiveMessage.id}`).set(archiveMessage);
    }
}

// Supprimer un canal (seulement si archivé)
function deleteChannel(channelId) {
    const channel = channels[channelId];
    if (!channel.archived) {
        alert('Vous devez d\'abord archiver le canal avant de le supprimer.');
        return;
    }
    
    if (confirm('Êtes-vous sûr de vouloir supprimer définitivement ce canal ?')) {
        // Supprimer le canal
        database.ref(`channels/${channelId}`).remove();
        
        // Supprimer tous les messages du canal
        database.ref(`messages/${channelId}`).remove();
        
        // Si c'était le canal actuel, retourner au canal police
        if (currentChannel === channelId) {
            selectChannel('police-only', 'Police uniquement');
        }
    }
}

// Sélectionner un canal
function selectChannel(channelId, channelName) {
    // Retirer l'ancien listener si existant
    if (messagesListener) {
        database.ref(`messages/${currentChannel}`).off('value', messagesListener);
    }
    
    currentChannel = channelId;
    channelNameHeader.textContent = `# ${channelName}`;
    
    // Activer l'input de message et le bouton de localisation
    messageInput.disabled = false;
    sendButton.disabled = false;
    if (currentUser.type === 'victim') {
        locationButton.disabled = false;
    }
    
    // Mettre à jour l'affichage des canaux
    displayChannels();
    
    // Charger les messages
    loadMessages();
}

// Charger les messages du canal actuel
function loadMessages() {
    messagesContainer.innerHTML = '';
    
    messagesListener = database.ref(`messages/${currentChannel}`).on('value', (snapshot) => {
        const messages = snapshot.val() || {};
        messagesContainer.innerHTML = '';
        
        // Convertir en tableau et trier par timestamp
        const messagesArray = Object.values(messages).sort((a, b) => a.timestamp - b.timestamp);
        
        messagesArray.forEach(message => {
            displayMessage(message);
        });
        
        // Scroll vers le bas
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    });
}

// Afficher un message
function displayMessage(message) {
    const messageElement = document.createElement('div');
    
    const time = new Date(message.timestamp).toLocaleTimeString('fr-FR', {
        hour: '2-digit',
        minute: '2-digit'
    });
    
    // Si c'est un message système
    if (message.type === 'system') {
        messageElement.className = 'system-message';
        messageElement.innerHTML = `
            <div class="system-message-content">
                ${escapeHtml(message.text)}
            </div>
        `;
    } else {
        messageElement.className = 'message';
        let messageContent = '';
        
        // Si c'est un message de localisation
        if (message.type === 'location' && message.location) {
            messageContent = `
                <div class="message-header">
                    <span class="message-author ${message.authorType}">
                        ${message.author}
                    </span>
                    <span class="message-timestamp">${time}</span>
                </div>
                <div class="location-message">
                    <div>
                        <i class="fas fa-map-marker-alt location-icon"></i>
                        <strong>Position partagée</strong>
                    </div>
                    <div class="location-data">
                        <div class="location-coords">
                            Latitude: ${message.location.latitude.toFixed(6)}<br>
                            Longitude: ${message.location.longitude.toFixed(6)}
                        </div>
                        ${message.location.address ? `<div style="margin-top: 8px;">📍 ${message.location.address}</div>` : ''}
                        <a href="https://www.google.com/maps?q=${message.location.latitude},${message.location.longitude}" 
                           target="_blank" 
                           class="map-link">
                            <i class="fas fa-external-link-alt"></i> Voir sur Google Maps
                        </a>
                    </div>
                </div>
            `;
        } else {
            // Message texte normal
            messageContent = `
                <div class="message-header">
                    <span class="message-author ${message.authorType}">
                        ${message.author}
                    </span>
                    <span class="message-timestamp">${time}</span>
                </div>
                <div class="message-text">${escapeHtml(message.text)}</div>
            `;
        }
        
        messageElement.innerHTML = `
            <div class="message-avatar">
                ${message.author.charAt(0).toUpperCase()}
            </div>
            <div class="message-content">
                ${messageContent}
            </div>
        `;
    }
    
    messagesContainer.appendChild(messageElement);
}

// Envoyer un message
function sendMessage() {
    const text = messageInput.value.trim();
    if (!text) return;
    
    const message = {
        id: Date.now().toString(),
        text: text,
        type: 'text',
        author: currentUser.username,
        authorType: currentUser.type,
        authorId: currentUser.id,
        timestamp: Date.now()
    };
    
    database.ref(`messages/${currentChannel}/${message.id}`).set(message);
    messageInput.value = '';
}

// Envoyer la localisation
async function sendLocation() {
    if (!navigator.geolocation) {
        alert('La géolocalisation n\'est pas supportée par votre navigateur');
        return;
    }
    
    // Désactiver le bouton pendant la récupération
    locationButton.disabled = true;
    locationButton.innerHTML = '<div class="loading-location"></div>';
    
    try {
        const position = await new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 0
            });
        });
        
        const { latitude, longitude } = position.coords;
        
        // Essayer de récupérer l'adresse approximative (optionnel)
        let address = null;
        try {
            const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1`);
            const data = await response.json();
            if (data.display_name) {
                address = data.display_name;
            }
        } catch (err) {
            console.log('Impossible de récupérer l\'adresse');
        }
        
        const message = {
            id: Date.now().toString(),
            type: 'location',
            author: currentUser.username,
            authorType: currentUser.type,
            authorId: currentUser.id,
            timestamp: Date.now(),
            location: {
                latitude: latitude,
                longitude: longitude,
                accuracy: position.coords.accuracy,
                address: address
            }
        };
        
        database.ref(`messages/${currentChannel}/${message.id}`).set(message);
        
    } catch (error) {
        let errorMessage = 'Impossible de récupérer votre position';
        
        switch(error.code) {
            case error.PERMISSION_DENIED:
                errorMessage = 'Vous avez refusé l\'accès à votre position';
                break;
            case error.POSITION_UNAVAILABLE:
                errorMessage = 'Votre position est indisponible';
                break;
            case error.TIMEOUT:
                errorMessage = 'La demande de position a expiré';
                break;
        }
        
        alert(errorMessage);
    } finally {
        // Réactiver le bouton
        locationButton.disabled = false;
        locationButton.innerHTML = '<i class="fas fa-map-marker-alt"></i>';
    }
}

// Event listeners pour l'envoi de messages
sendButton.addEventListener('click', sendMessage);
messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        sendMessage();
    }
});

// Event listener pour le bouton de localisation
locationButton.addEventListener('click', sendLocation);

// Fonction utilitaire pour échapper le HTML
function escapeHtml(text) {
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
}

// Initialiser le canal police-only s'il n'existe pas
database.ref('channels/police-only').once('value', (snapshot) => {
    if (!snapshot.exists()) {
        database.ref('channels/police-only').set({
            id: 'police-only',
            name: 'Police uniquement',
            type: 'police',
            createdAt: Date.now()
        });
    }
});

// Gérer la déconnexion/fermeture de fenêtre
window.addEventListener('beforeunload', () => {
    if (currentUser) {
        database.ref(`users/${currentUser.id}`).remove();
    }
});

// Rendre les fonctions globales pour les boutons onclick
window.selectChannel = selectChannel;
window.archiveChannel = archiveChannel;
window.deleteChannel = deleteChannel;

// Ajouter des styles supplémentaires pour la scrollbar
const style = document.createElement('style');
style.textContent = `
    /* Scrollbar personnalisée */
    ::-webkit-scrollbar {
        width: 8px;
    }
    
    ::-webkit-scrollbar-track {
        background: #2f3136;
    }
    
    ::-webkit-scrollbar-thumb {
        background: #202225;
        border-radius: 4px;
    }
    
    ::-webkit-scrollbar-thumb:hover {
        background: #18191c;
    }
`;
document.head.appendChild(style);