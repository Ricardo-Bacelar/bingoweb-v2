import React, { useState, useEffect, useRef } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { View, Text, StyleSheet, TouchableOpacity, Alert, Animated, Easing } from 'react-native';
import Icon from 'react-native-vector-icons/FontAwesome';
import io from 'socket.io-client';
import Sound from 'react-native-sound';

const Stack = createNativeStackNavigator();

// Configuração do Socket.IO
let socket;
const SERVER_URL = 'http://192.168.1.100:3000';

// Configuração de som
Sound.setCategory('Playback');
let numberSound, winSound;

// Carrega os sons
try {
  numberSound = new Sound('numberCalled.mp3', Sound.MAIN_BUNDLE);
  winSound = new Sound('win.mp3', Sound.MAIN_BUNDLE);
} catch (error) {
  console.log('Erro ao carregar sons', error);
}

// Context para histórico
const HistoryContext = React.createContext();

const HomeScreen = ({ navigation }) => {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Bingo Multiplayer</Text>
      
      <TouchableOpacity 
        style={styles.button}
        onPress={() => navigation.navigate('RoomSelection', { role: 'host' })}
      >
        <Text style={styles.buttonText}>Ser Mestre</Text>
      </TouchableOpacity>
      
      <TouchableOpacity 
        style={styles.button}
        onPress={() => navigation.navigate('RoomSelection', { role: 'player' })}
      >
        <Text style={styles.buttonText}>Ser Jogador</Text>
      </TouchableOpacity>
      
      <TouchableOpacity 
        style={styles.secondaryButton}
        onPress={() => navigation.navigate('OfflineGame')}
      >
        <Text style={styles.secondaryButtonText}>Praticar Offline</Text>
      </TouchableOpacity>
      
      <TouchableOpacity 
        style={styles.secondaryButton}
        onPress={() => navigation.navigate('History')}
      >
        <Text style={styles.secondaryButtonText}>Histórico</Text>
      </TouchableOpacity>
    </View>
  );
};

const RoomSelectionScreen = ({ navigation, route }) => {
  const { role } = route.params;
  const [roomCode, setRoomCode] = useState('');
  const [generatedCode, setGeneratedCode] = useState('');

  const generateRoomCode = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 4; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setGeneratedCode(result);
    return result;
  };

  const joinRoom = () => {
    if (role === 'host') {
      const code = roomCode || generateRoomCode();
      navigation.navigate('HostScreen', { roomCode: code });
    } else {
      if (roomCode.length === 4) {
        navigation.navigate('PlayerScreen', { roomCode });
      } else {
        Alert.alert('Erro', 'O código da sala deve ter 4 caracteres');
      }
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>
        {role === 'host' ? 'Criar Sala' : 'Entrar na Sala'}
      </Text>
      
      {role === 'host' && (
        <TouchableOpacity 
          style={styles.button}
          onPress={() => setRoomCode(generateRoomCode())}
        >
          <Text style={styles.buttonText}>Gerar Código</Text>
        </TouchableOpacity>
      )}
      
      <Text style={styles.roomCodeDisplay}>
        {roomCode || generatedCode || '----'}
      </Text>
      
      <Text style={styles.label}>Digite o código da sala:</Text>
      <TextInput
        style={styles.input}
        value={roomCode}
        onChangeText={setRoomCode}
        maxLength={4}
        autoCapitalize="characters"
      />
      
      <TouchableOpacity 
        style={styles.button}
        onPress={joinRoom}
        disabled={role === 'player' && !roomCode}
      >
        <Text style={styles.buttonText}>
          {role === 'host' ? 'Criar Sala' : 'Entrar'}
        </Text>
      </TouchableOpacity>
    </View>
  );
};

const HostScreen = ({ route }) => {
  const { roomCode } = route.params;
  const [calledNumbers, setCalledNumbers] = useState([]);
  const [currentNumber, setCurrentNumber] = useState(null);
  const [gameStarted, setGameStarted] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [playersCount, setPlayersCount] = useState(0);
  const { addHistory } = React.useContext(HistoryContext);

  useEffect(() => {
    socket = io(SERVER_URL);
    socket.emit('register-host', roomCode);

    socket.on('player-joined', (count) => {
      setPlayersCount(count);
    });

    socket.on('game-over', (winnerId) => {
      setGameOver(true);
      addHistory({
        date: new Date().toISOString(),
        roomCode,
        winner: `Jogador ${winnerId}`,
        numbersCalled: calledNumbers.length,
        result: 'Vitória'
      });
      Alert.alert('Fim de Jogo', `Jogador ${winnerId} venceu!`);
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  const startGame = () => {
    setGameStarted(true);
    callNumber();
  };

  const callNumber = () => {
    if (gameOver) return;

    let newNumber;
    do {
      newNumber = Math.floor(Math.random() * 75) + 1;
    } while (calledNumbers.includes(newNumber));

    setCurrentNumber(newNumber);
    setCalledNumbers([...calledNumbers, newNumber]);
    socket.emit('call-number', { number: newNumber, roomCode });
    
    // Tocar som
    if (numberSound) {
      numberSound.play();
    }

    if (calledNumbers.length >= 74) {
      setGameOver(true);
      addHistory({
        date: new Date().toISOString(),
        roomCode,
        winner: 'Ninguém',
        numbersCalled: 75,
        result: 'Todos os números sorteados'
      });
      Alert.alert('Fim de Jogo', 'Todos os números foram sorteados!');
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Sala: {roomCode}</Text>
      <Text style={styles.subtitle}>Jogadores conectados: {playersCount}</Text>
      
      {!gameStarted ? (
        <TouchableOpacity 
          style={styles.button} 
          onPress={startGame}
          disabled={playersCount === 0}
        >
          <Text style={styles.buttonText}>
            {playersCount === 0 ? 'Aguardando jogadores...' : 'Iniciar Jogo'}
          </Text>
        </TouchableOpacity>
      ) : (
        <>
          <Text style={styles.currentNumber}>{currentNumber || '--'}</Text>
          
          <TouchableOpacity 
            style={styles.button} 
            onPress={callNumber}
            disabled={gameOver}
          >
            <Text style={styles.buttonText}>Sortear Próximo</Text>
          </TouchableOpacity>
          
          <Text style={styles.calledNumbersTitle}>
            Números Sorteados: {calledNumbers.length}
          </Text>
          <View style={styles.calledNumbersContainer}>
            {calledNumbers.map((num, index) => (
              <Text key={index} style={styles.calledNumber}>{num}</Text>
            ))}
          </View>
        </>
      )}
    </View>
  );
};

const PlayerScreen = ({ route }) => {
  const { roomCode } = route.params;
  const [card, setCard] = useState([]);
  const [calledNumbers, setCalledNumbers] = useState([]);
  const [gameOver, setGameOver] = useState(false);
  const [isWinner, setIsWinner] = useState(false);
  const [playerId, setPlayerId] = useState('');
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const { addHistory } = React.useContext(HistoryContext);

  useEffect(() => {
    // Gerar cartela aleatória
    generateCard();

    socket = io(SERVER_URL);
    socket.emit('register-player', roomCode);

    socket.on('player-id', (id) => {
      setPlayerId(id);
    });

    socket.on('call-number', (number) => {
      setCalledNumbers(prev => [...prev, number]);
      // Efeito sonoro
      if (numberSound) {
        numberSound.play();
      }
    });

    socket.on('game-over', (winnerId) => {
      setGameOver(true);
      setIsWinner(winnerId === playerId);
      
      if (winnerId === playerId) {
        // Animação de vitória
        Animated.sequence([
          Animated.timing(scaleAnim, {
            toValue: 1.2,
            duration: 300,
            easing: Easing.ease,
            useNativeDriver: true,
          }),
          Animated.timing(scaleAnim, {
            toValue: 0.9,
            duration: 200,
            easing: Easing.ease,
            useNativeDriver: true,
          }),
          Animated.timing(scaleAnim, {
            toValue: 1.1,
            duration: 200,
            easing: Easing.ease,
            useNativeDriver: true,
          }),
          Animated.timing(scaleAnim, {
            toValue: 1,
            duration: 300,
            easing: Easing.ease,
            useNativeDriver: true,
          }),
        ]).start();
        
        // Som de vitória
        if (winSound) {
          winSound.play();
        }
        
        addHistory({
          date: new Date().toISOString(),
          roomCode,
          winner: 'Você',
          numbersCalled: calledNumbers.length,
          result: 'Vitória'
        });
      } else {
        addHistory({
          date: new Date().toISOString(),
          roomCode,
          winner: `Jogador ${winnerId}`,
          numbersCalled: calledNumbers.length,
          result: 'Derrota'
        });
      }
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  // ... (generateCard, toggleNumber, checkWinCondition permanecem iguais)

  const endGame = (winner) => {
    if (winner) {
      socket.emit('player-win', { playerId, roomCode });
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Sala: {roomCode}</Text>
      <Text style={styles.subtitle}>Seu ID: {playerId}</Text>
      
      {gameOver && isWinner && (
        <Animated.View style={[styles.winnerBanner, { transform: [{ scale: scaleAnim }] }]}>
          <Text style={styles.winnerText}>VOCÊ VENCEU!</Text>
        </Animated.View>
      )}
      
      <View style={styles.cardContainer}>
        {card.map((row, rowIndex) => (
          <View key={rowIndex} style={styles.cardRow}>
            {row.map((cell, colIndex) => (
              <TouchableOpacity
                key={colIndex}
                style={[
                  styles.cardCell,
                  cell.marked && styles.cardCellMarked,
                  rowIndex === 2 && colIndex === 2 && styles.cardCellFree
                ]}
                onPress={() => toggleNumber(rowIndex, colIndex)}
                disabled={gameOver}
              >
                <Text style={styles.cardCellText}>{cell.number}</Text>
              </TouchableOpacity>
            ))}
          </View>
        ))}
      </View>
      
      {/* Restante do código permanece igual */}
    </View>
  );
};

const OfflineGame = () => {
  const [card, setCard] = useState([]);
  const [calledNumbers, setCalledNumbers] = useState([]);
  const [currentNumber, setCurrentNumber] = useState(null);
  const [gameOver, setGameOver] = useState(false);
  const [isWinner, setIsWinner] = useState(false);
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const { addHistory } = React.useContext(HistoryContext);

  useEffect(() => {
    generateCard();
  }, []);

  // ... (generateCard, toggleNumber, checkWinCondition similares ao PlayerScreen)

  const callNumber = () => {
    if (gameOver) return;

    let newNumber;
    do {
      newNumber = Math.floor(Math.random() * 75) + 1;
    } while (calledNumbers.includes(newNumber));

    setCurrentNumber(newNumber);
    setCalledNumbers([...calledNumbers, newNumber]);
    
    if (numberSound) {
      numberSound.play();
    }

    if (calledNumbers.length >= 74) {
      setGameOver(true);
      addHistory({
        date: new Date().toISOString(),
        roomCode: 'OFFLINE',
        winner: 'Ninguém',
        numbersCalled: 75,
        result: 'Todos os números sorteados'
      });
    }
  };

  const endGame = (winner) => {
    setGameOver(true);
    setIsWinner(winner);
    
    if (winner) {
      // Animação de vitória
      Animated.sequence([
        Animated.timing(scaleAnim, {
          toValue: 1.2,
          duration: 300,
          easing: Easing.ease,
          useNativeDriver: true,
        }),
        Animated.timing(scaleAnim, {
          toValue: 0.9,
          duration: 200,
          easing: Easing.ease,
          useNativeDriver: true,
        }),
        Animated.timing(scaleAnim, {
          toValue: 1.1,
          duration: 200,
          easing: Easing.ease,
          useNativeDriver: true,
        }),
        Animated.timing(scaleAnim, {
          toValue: 1,
          duration: 300,
          easing: Easing.ease,
          useNativeDriver: true,
        }),
      ]).start();
      
      if (winSound) {
        winSound.play();
      }
      
      addHistory({
        date: new Date().toISOString(),
        roomCode: 'OFFLINE',
        winner: 'Você',
        numbersCalled: calledNumbers.length,
        result: 'Vitória'
      });
    }
  };

  const resetGame = () => {
    generateCard();
    setCalledNumbers([]);
    setCurrentNumber(null);
    setGameOver(false);
    setIsWinner(false);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Bingo Offline</Text>
      
      {gameOver && isWinner && (
        <Animated.View style={[styles.winnerBanner, { transform: [{ scale: scaleAnim }] }]}>
          <Text style={styles.winnerText}>VOCÊ VENCEU!</Text>
        </Animated.View>
      )}
      
      <View style={styles.cardContainer}>
        {/* Renderização da cartela igual ao PlayerScreen */}
      </View>
      
      <Text style={styles.currentNumber}>{currentNumber || '--'}</Text>
      
      {!gameOver ? (
        <TouchableOpacity 
          style={styles.button} 
          onPress={callNumber}
        >
          <Text style={styles.buttonText}>Sortear Número</Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity 
          style={styles.button} 
          onPress={resetGame}
        >
          <Text style={styles.buttonText}>Novo Jogo</Text>
        </TouchableOpacity>
      )}
      
      {/* Restante do código */}
    </View>
  );
};

const HistoryScreen = () => {
  const { history } = React.useContext(HistoryContext);
  
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Histórico de Partidas</Text>
      
      {history.length === 0 ? (
        <Text style={styles.noHistoryText}>Nenhuma partida registrada</Text>
      ) : (
        <FlatList
          data={history}
          keyExtractor={(item, index) => index.toString()}
          renderItem={({ item }) => (
            <View style={styles.historyItem}>
              <Text style={styles.historyDate}>
                {new Date(item.date).toLocaleDateString()}
              </Text>
              <Text>Sala: {item.roomCode}</Text>
              <Text>Vencedor: {item.winner}</Text>
              <Text>Números sorteados: {item.numbersCalled}</Text>
              <Text style={item.result === 'Vitória' ? styles.historyWin : styles.historyLoss}>
                {item.result}
              </Text>
            </View>
          )}
        />
      )}
    </View>
  );
};

const HistoryProvider = ({ children }) => {
  const [history, setHistory] = useState([]);

  const addHistory = (item) => {
    setHistory(prev => [item, ...prev].slice(0, 50)); // Limita a 50 itens
  };

  return (
    <HistoryContext.Provider value={{ history, addHistory }}>
      {children}
    </HistoryContext.Provider>
  );
};

const App = () => {
  return (
    <HistoryProvider>
      <NavigationContainer>
        <Stack.Navigator initialRouteName="Home">
          <Stack.Screen name="Home" component={HomeScreen} />
          <Stack.Screen name="RoomSelection" component={RoomSelectionScreen} />
          <Stack.Screen name="HostScreen" component={HostScreen} />
          <Stack.Screen name="PlayerScreen" component={PlayerScreen} />
          <Stack.Screen name="OfflineGame" component={OfflineGame} />
          <Stack.Screen name="History" component={HistoryScreen} />
        </Stack.Navigator>
      </NavigationContainer>
    </HistoryProvider>
  );
};

// Atualizações de estilo
const styles = StyleSheet.create({
  // ... (estilos anteriores)
  
  secondaryButton: {
    backgroundColor: '#95a5a6',
    padding: 12,
    borderRadius: 10,
    marginVertical: 8,
    width: '70%',
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: 'white',
    fontSize: 16,
  },
  input: {
    height: 40,
    width: '60%',
    borderColor: '#ddd',
    borderWidth: 1,
    borderRadius: 5,
    padding: 10,
    marginBottom: 20,
    textAlign: 'center',
    fontSize: 18,
  },
  label: {
    fontSize: 16,
    marginBottom: 8,
  },
  roomCodeDisplay: {
    fontSize: 40,
    fontWeight: 'bold',
    marginVertical: 20,
    letterSpacing: 5,
  },
  subtitle: {
    fontSize: 16,
    color: '#7f8c8d',
    marginBottom: 10,
  },
  winnerBanner: {
    backgroundColor: '#f1c40f',
    padding: 15,
    borderRadius: 10,
    marginBottom: 20,
  },
  historyItem: {
    backgroundColor: 'white',
    padding: 15,
    borderRadius: 10,
    marginBottom: 10,
    width: '100%',
  },
  historyDate: {
    fontWeight: 'bold',
    marginBottom: 5,
  },
  historyWin: {
    color: '#27ae60',
    fontWeight: 'bold',
  },
  historyLoss: {
    color: '#e74c3c',
  },
  noHistoryText: {
    fontSize: 16,
    color: '#7f8c8d',
    marginTop: 20,
  },
});

export default App;