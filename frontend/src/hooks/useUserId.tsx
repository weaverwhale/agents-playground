import { useState, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';

export const useUserId = () => {
  const [userId, setUserId] = useState<string>('');

  useEffect(() => {
    const storedUserId = localStorage.getItem('chatAgentUserId');
    const newUserId = storedUserId || uuidv4();

    if (!storedUserId) {
      localStorage.setItem('chatAgentUserId', newUserId);
    }

    setUserId(newUserId);
  }, []);

  return userId;
};
