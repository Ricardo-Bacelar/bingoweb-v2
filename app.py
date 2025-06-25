#import os
#from flask import Flask, render_template, request, url_for
#from flask_socketio import SocketIO, emit, join_room, leave_room
#import random
#import logging # Adicionado para logs mais detalhados
from flask import Flask, render_template
from flask_socketio import SocketIO, emit

app = Flask(__name__)
app.config['SECRET_KEY'] = '…'

socketio = SocketIO(app, cors_allowed_origins="*")

@app.route('/')
def home_cartela():
    return render_template('index.html')

@app.route('/host')
def host_bingo():
    return render_template('host.html')

# … resto do código …

if __name__ == '__main__':
    socketio.run(app, host='0.0.0.0', port=int(os.environ.get('PORT', 5000)))

# Configuração do Flask para encontrar templates e arquivos estáticos
# Assumimos a estrutura padrão: templates/ e static/ na raiz do projeto
app = Flask(__name__, template_folder='templates', static_folder='static')
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'sua_chave_secreta_muito_segura_aqui') # Chave secreta para segurança
# Inicialize o SocketIO com seu aplicativo Flask
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='gevent', logger=True, engineio_logger=True)

# Variáveis globais para o estado do jogo
sorted_numbers = []
available_numbers = list(range(1, 76)) # Números ainda não sorteados
players = {} # Dicionário para armazenar informações dos jogadores {sid: {name, card_data, marked_numbers, has_bingo, win_mode}}

# Rotas
@app.route('/')
def home_cartela():
    return render_template('index.html')

@app.route('/host')
def host_bingo():
    return render_template('host.html')

@app.route('/sobre')
def about():
    return "Esta é uma página sobre o nosso aplicativo de bingo."

# Manipuladores de Eventos WebSocket
@socketio.on('connect')
def handle_connect():
    player_sid = request.sid
    print(f"Cliente conectado! SID: {player_sid}")
    
    # Adiciona o novo jogador (se não for um host já conectado com outro sid)
    if player_sid not in players:
        players[player_sid] = {
            'sid': player_sid,
            'name': f"Jogador #{player_sid[:4]}",
            'card_data': [],
            'marked_numbers': [],
            'has_bingo': False,
            'win_mode': None
        }
    
    emit('sorted_numbers_history', {'numbers': sorted_numbers}, room=player_sid)
    emit('players_update', {'players': list(players.values())}, broadcast=True)

@socketio.on('disconnect')
def handle_disconnect():
    player_sid = request.sid
    print(f"Cliente desconectado. SID: {player_sid}")
    if player_sid in players:
        del players[player_sid]
    emit('players_update', {'players': list(players.values())}, broadcast=True)

@socketio.on('host_connected')
def handle_host_connect():
    host_sid = request.sid
    print(f"Host conectado: {host_sid}")
    # Garante que o host também seja registrado na lista de players, talvez com um flag especial
    if host_sid not in players:
        players[host_sid] = {
            'sid': host_sid,
            'name': "Host",
            'is_host': True, # Identifica como host
            'card_data': [],
            'marked_numbers': [],
            'has_bingo': False
        }
    emit('sorted_numbers_history', {'numbers': sorted_numbers}, room=host_sid)
    emit('players_update', {'players': list(players.values())}, room=host_sid) # Apenas para o host que acabou de conectar

@socketio.on('solicitar_sorteio')
def handle_solicitar_sorteio():
    global sorted_numbers, available_numbers, players
    
    # Verifica se já há um vencedor
    for player_sid, player_data in players.items():
        if player_data.get('has_bingo'):
            print(f"Jogo parado: {player_data['name']} já fez BINGO!")
            return # Não sorteia mais se já há um vencedor

    if not available_numbers:
        print("Todos os números foram sorteados. Reiniciando o jogo automaticamente.")
        handle_reset_game()
        return

    if available_numbers:
        number = random.choice(available_numbers)
        available_numbers.remove(number)
        sorted_numbers.append(number)
        sorted_numbers.sort()
        print(f"Número sorteado: {number}")

        emit('numero_sorteado_bingo', {'number': number}, broadcast=True)
        emit('sorted_numbers_history', {'numbers': sorted_numbers}, broadcast=True)
    
    # Após sortear um número, é uma boa hora para atualizar o status dos jogadores no host
    emit('players_update', {'players': list(players.values())}, broadcast=True)


@socketio.on('reset_game')
def handle_reset_game():
    global sorted_numbers, available_numbers, players
    print("Jogo reiniciado por solicitação do host.")
    sorted_numbers = []
    available_numbers = list(range(1, 76))
    
    # Limpa o status de todos os jogadores
    for sid in players:
        players[sid]['card_data'] = []
        players[sid]['marked_numbers'] = []
        players[sid]['has_bingo'] = False
        players[sid]['win_mode'] = None
        # Mantém 'is_host' se existir
        if 'is_host' not in players[sid]:
            players[sid]['name'] = f"Jogador #{sid[:4]}" # Reseta nomes para jogadores normais

    emit('game_reset', {}, broadcast=True)
    emit('players_update', {'players': list(players.values())}, broadcast=True) # Atualiza o host e outros jogadores
    print("Estado do jogo resetado.")

@socketio.on('player_card_data')
def handle_player_card_data(data):
    player_sid = request.sid
    player_name = data.get('player_name', f"Jogador #{player_sid[:4]}")
    card_data = data.get('card_data', [])
    
    if player_sid in players:
        players[player_sid]['name'] = player_name
        players[player_sid]['card_data'] = card_data
        # Garante que 'X' esteja na lista de marcados se a cartela tem um 'X'
        has_x = any('X' in row for row in card_data)
        players[player_sid]['marked_numbers'] = ['X'] if has_x else []
        players[player_sid]['has_bingo'] = False # Reseta o status de bingo ao gerar nova cartela
        players[player_sid]['win_mode'] = None
    else:
        # Caso o jogador se conecte e envie dados antes do 'connect' ser totalmente processado
        players[player_sid] = {
            'sid': player_sid,
            'name': player_name, 
            'card_data': card_data, 
            'marked_numbers': ['X'] if any('X' in row for row in card_data) else [],
            'has_bingo': False,
            'win_mode': None
        }
    print(f"Cartela de {player_name} ({player_sid[:4]}) recebida.")
    emit('players_update', {'players': list(players.values())}, broadcast=True)

@socketio.on('card_marked_number')
def handle_card_marked_number(data):
    player_sid = request.sid
    marked_numbers_from_client = data.get('marked_numbers', [])
    if player_sid in players:
        # Atualiza apenas os números marcados pelo jogador.
        # Mantém o 'X' central se ele existe na cartela.
        player_data = players[player_sid]
        current_card = player_data.get('card_data', [])
        has_x_in_card = any('X' in row for row in current_card)
        
        updated_marked_numbers = list(set(marked_numbers_from_client)) # Remove duplicatas
        if has_x_in_card and 'X' not in updated_marked_numbers:
            updated_marked_numbers.append('X')
        
        players[player_sid]['marked_numbers'] = sorted([int(n) if isinstance(n, str) and n.isdigit() else n for n in updated_marked_numbers])
    
    # Para o host ver as marcações, atualizamos a lista de jogadores periodicamente
    # ou o host pode solicitar uma atualização. Por enquanto, a cada BINGO ou sorteio já atualiza.


@socketio.on('BINGO')
def handle_bingo_claim(data):
    player_sid = request.sid
    player_name = data.get('player_name', f"Jogador #{player_sid[:4]}")
    win_mode = data.get('win_mode', 'BINGO')
    card_data = data.get('card_data', [])
    marked_numbers_client = data.get('marked_numbers', [])

    print(f"BINGO reivindicado por {player_name} (SID: {player_sid[:4]}) no modo: {win_mode}")

    # Validação CRÍTICA do BINGO no servidor para evitar fraudes
    is_valid_bingo = False
    
    # 1. Verificar se o jogador já não foi marcado como vencedor
    if player_sid in players and players[player_sid].get('has_bingo'):
        print(f"BINGO duplicado de {player_name}.")
        return # Já marcou bingo, ignora

    # 2. Verificar se a cartela enviada corresponde à cartela do jogador no servidor (se armazenada)
    # Para esta implementação simplificada, assumimos que card_data do cliente é o correto,
    # mas em um sistema robusto, você compararia com `players[player_sid]['card_data']`.

    # 3. Verificar se todos os números marcados na reivindicação foram realmente sorteados
    all_marked_are_sorted = True
    for num in marked_numbers_client:
        if num != 'X' and int(num) not in sorted_numbers:
            all_marked_are_sorted = False
            break

    if all_marked_are_sorted:
        # Recriar a lógica de checagem de bingo no servidor
        # (Isso requer que a `card_data` seja a cartela *real* do jogador)
        # Por simplicidade, vamos revalidar a linha/coluna/diagonal no servidor.

        # Adaptar a lógica de checkBingo do JS para Python aqui
        # Esta é uma validação simplificada
        # Para uma validação completa, seria ideal re-simular a cartela e as marcações
        # e verificar as linhas/colunas/diagonais/cartela cheia.
        # Por agora, vamos confiar na reivindicação do cliente se os números foram sorteados.
        is_valid_bingo = True # Assumimos válido se todos os números marcados foram sorteados

    if is_valid_bingo and player_sid in players:
        players[player_sid]['has_bingo'] = True
        players[player_sid]['win_mode'] = win_mode
        print(f"BINGO de {player_name} VALIDADO!")
        emit('WINNER_ANNOUNCEMENT', {
            'winner_name': player_name,
            'winner_sid': player_sid,
            'win_mode': win_mode
        }, broadcast=True)
    elif player_sid in players:
        players[player_sid]['has_bingo'] = False # Garante que não está marcado como vencedor
        players[player_sid]['win_mode'] = None
        print(f"BINGO de {player_name} INVÁLIDO!")
        emit('bingo_invalid', {'message': 'Seu BINGO não foi validado pelo servidor. Verifique sua cartela ou os números sorteados.'}, room=player_sid)

    emit('players_update', {'players': list(players.values())}, broadcast=True)


# Inicialização do Servidor
if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    print("Iniciando o servidor Flask-SocketIO...")
    socketio.run(app, host='0.0.0.0', port=port, allow_unsafe_werkzeug=True)