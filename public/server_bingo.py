import asyncio
import websockets
import json
import random

# Conjunto para armazenar todas as conexões ativas (clientes)
connected_clients = set()

# Dicionário para armazenar as informações das cartelas dos jogadores
# Key: websocket_id (hash do objeto websocket)
# Value: { 'cartela': [[...]], 'numeros_marcados': [], 'modo_vitoria': 'linha', 'address': 'ip:port', 'websocket': ws_obj, 'name': 'Player Name' }
player_cartelas = {}

# Lista de números já sorteados
sorted_numbers = []

async def get_player_count():
    """Retorna o número de jogadores com cartelas ativas."""
    active_players = 0
    for player_id, data in player_cartelas.items():
        if data['websocket'] in connected_clients:
            active_players += 1
    return active_players

async def register(websocket):
    """Registra um novo cliente."""
    connected_clients.add(websocket)
    if sorted_numbers:
        await websocket.send(json.dumps({'type': 'sorted_numbers_history', 'numbers': sorted_numbers}))
    
    await broadcast_player_count()
    print(f"[{websocket.remote_address}] Conectado. Total de clientes: {len(connected_clients)}. Jogadores: {await get_player_count()}")

async def unregister(websocket):
    """Desregistra um cliente."""
    if websocket in connected_clients:
        connected_clients.remove(websocket)
        player_id = hash(websocket)
        if player_id in player_cartelas:
            del player_cartelas[player_id]
            print(f"[{websocket.remote_address}] Cartela do jogador removida.")
        
        await broadcast_player_count()
        print(f"[{websocket.remote_address}] Desconectado. Total de clientes: {len(connected_clients)}. Jogadores: {await get_player_count()}")
    else:
        print(f"[{websocket.remote_address}] Tentativa de desregistro de cliente não conectado.")

async def broadcast_message(message):
    """Envia uma mensagem para todos os clientes conectados."""
    if connected_clients:
        # Cria uma cópia do conjunto para iterar, pois ele pode ser modificado
        # se um cliente desconectar durante o broadcast
        clients_to_send = list(connected_clients)
        for client in clients_to_send:
            try:
                await client.send(message)
            except websockets.exceptions.ConnectionClosed: # Melhor tratar apenas ConnectionClosed
                print(f"[{client.remote_address}] Cliente desconectado durante broadcast. Removendo...")
                await unregister(client) # Remove o cliente imediatamente se a conexão falhou
            except Exception as ex:
                print(f"Erro enviando para cliente {client.remote_address}: {ex}")
                await unregister(client) # Remove outros erros de envio

async def broadcast_player_count():
    """Envia a contagem atual de jogadores para todos os clientes."""
    player_count = await get_player_count()
    await broadcast_message(json.dumps({'type': 'player_count_update', 'count': player_count}))


async def bingo_server(websocket):
    """
    Lida com as conexões e mensagens dos clientes.
    """
    await register(websocket)
    try:
        async for message in websocket:
            print(f"[{websocket.remote_address}] Recebido: {message}")

            try:
                data = json.loads(message)
                msg_type = data.get('type')

                if msg_type == 'sort_number':
                    num = data.get('number')
                    if num is not None and num not in sorted_numbers:
                        sorted_numbers.append(num)
                        print(f"Número sorteado: {num}")
                        await broadcast_message(json.dumps({'type': 'sorted_number', 'number': num}))

                elif msg_type == 'player_card_data':
                    player_id = hash(websocket)
                    player_cartelas[player_id] = {
                        'cartela': data['card_data'],
                        'modo_vitoria': data['win_mode'],
                        'numeros_marcados': data.get('marked_numbers', []),
                        'websocket': websocket,
                        'address': str(websocket.remote_address),
                        'name': data.get('player_name', "Jogador Anônimo") # NOVO: Armazena o nome
                    }
                    print(f"[{websocket.remote_address}] Dados da cartela recebidos. Nome: {player_cartelas[player_id]['name']}. Total de cartelas registradas: {len(player_cartelas)}")
                    await broadcast_player_count()

                elif msg_type == 'card_marked_number':
                    player_id = hash(websocket)
                    if player_id in player_cartelas:
                        player_cartelas[player_id]['numeros_marcados'] = data.get('marked_numbers', [])
                        print(f"[{websocket.remote_address}] Números marcados atualizados.")

                elif msg_type == 'WINNER':
                    winner_websocket = websocket
                    winner_id = hash(winner_websocket)
                    if winner_id in player_cartelas:
                        winner_info = player_cartelas[winner_id]
                        winner_name = winner_info.get('name', "Jogador Anônimo") # Obtém o nome
                        print(f"!!!!!! BINGO! Jogador {winner_name} ({winner_websocket.remote_address}) venceu com a cartela: {winner_info['cartela']} !!!!!!")
                        await broadcast_message(json.dumps({
                            'type': 'WINNER',
                            'winner_address': str(winner_websocket.remote_address),
                            'winner_name': winner_name, # NOVO: Envia o nome do vencedor
                            'winning_card_data': winner_info['cartela'],
                            'win_mode': winner_info.get('modo_vitoria', 'BINGO') # Envia o modo de vitória
                        }))

                elif msg_type == 'reset_game':
                    await reset_game()
                    await broadcast_message(json.dumps({'type': 'game_reset'}))
                    print("Jogo reiniciado por solicitação do cliente.")
                    await broadcast_player_count()

                else:
                    print(f"[{websocket.remote_address}] Tipo de mensagem JSON desconhecido: {msg_type}")

            except json.JSONDecodeError:
                print(f"[{websocket.remote_address}] Mensagem não JSON recebida: {message}")
                if message == "WINNER": # Ainda para compatibilidade se houver algum cliente antigo
                    winner_websocket = websocket
                    winner_id = hash(winner_websocket)
                    if winner_id in player_cartelas:
                        winner_info = player_cartelas[winner_id]
                        winner_name = winner_info.get('name', "Jogador Anônimo")
                        print(f"!!!!!! BINGO! Jogador {winner_name} ({winner_websocket.remote_address}) venceu (via mensagem simples) !!!!!!")
                        await broadcast_message(json.dumps({
                            'type': 'WINNER',
                            'winner_address': str(winner_websocket.remote_address),
                            'winner_name': winner_name,
                            'winning_card_data': winner_info['cartela']
                        }))

    except websockets.exceptions.ConnectionClosedOK:
        print(f"[{websocket.remote_address}] Conexão fechada normalmente.")
    except websockets.exceptions.ConnectionClosedError as e:
        print(f"[{websocket.remote_address}] Conexão fechada com erro: {e}")
    except Exception as e:
        print(f"[{websocket.remote_address}] Erro inesperado no handler do WebSocket: {e}")
    finally:
        await unregister(websocket)

async def reset_game():
    """Reinicia o estado do jogo."""
    global sorted_numbers, player_cartelas
    sorted_numbers = []
    player_cartelas = {} # Limpa os dados das cartelas registradas
    print("Estado do jogo resetado.")

async def main():
    """Função principal para iniciar o servidor."""
    async with websockets.serve(bingo_server, "0.0.0.0", 8080):
        print("Servidor WebSocket de Bingo iniciado em ws://localhost:8080")
        await asyncio.Future()

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nServidor encerrado por KeyboardInterrupt.")
    except Exception as e:
        print(f"Erro fatal ao iniciar ou executar o servidor: {e}")