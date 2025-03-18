import React, { useState, useEffect } from 'react';
import axios from 'axios';

interface UserPreferencesProps {
  userId: string;
}

interface Preferences {
  preferred_airlines: string[];
  hotel_amenities: string[];
  budget_level: string;
  preferred_cuisines: string[];
  transportation_preference: string;
}

const UserPreferences: React.FC<UserPreferencesProps> = ({ userId }) => {
  const [preferences, setPreferences] = useState<Preferences>({
    preferred_airlines: [],
    hotel_amenities: [],
    budget_level: 'mid-range',
    preferred_cuisines: [],
    transportation_preference: 'No Preference'
  });
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [saveMessage, setSaveMessage] = useState<string>('');

  // Airlines options
  const airlineOptions: string[] = [
    'SkyWays', 'OceanAir', 'MountainJet', 'Delta', 'United', 'American', 'Southwest'
  ];

  // Hotel amenities options
  const amenityOptions: string[] = [
    'WiFi', 'Pool', 'Gym', 'Free Breakfast', 'Restaurant', 'Spa', 'Parking'
  ];

  // Cuisine options
  const cuisineOptions: string[] = [
    'Italian', 'Japanese', 'Mexican', 'Chinese', 'French', 'Indian', 'Thai', 'American'
  ];

  // Transportation options
  const transportationOptions: string[] = [
    'Public Transit', 'Taxi', 'Ride-Share', 'Walking', 'No Preference'
  ];

  // Budget level options
  const budgetOptions: string[] = ['budget', 'mid-range', 'luxury'];

  const handleCheckboxChange = (category: keyof Pick<Preferences, 'preferred_airlines' | 'hotel_amenities' | 'preferred_cuisines'>, item: string): void => {
    setPreferences(prev => {
      const current = [...prev[category]];
      if (current.includes(item)) {
        return { ...prev, [category]: current.filter(i => i !== item) };
      } else {
        return { ...prev, [category]: [...current, item] };
      }
    });
  };

  const handleRadioChange = (category: keyof Pick<Preferences, 'budget_level' | 'transportation_preference'>, value: string): void => {
    setPreferences(prev => ({ ...prev, [category]: value }));
  };

  const savePreferences = async (): Promise<void> => {
    setIsSaving(true);
    setSaveMessage('');
    
    try {
      await axios.post(`/user/${userId}/preferences`, preferences);
      setSaveMessage('Preferences saved successfully!');
      setTimeout(() => setSaveMessage(''), 3000);
    } catch (error) {
      console.error('Error saving preferences:', error);
      setSaveMessage('Error saving preferences. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="preferences-panel overflow-y-auto">
      <h2 className="text-lg font-bold mb-4">Travel Preferences</h2>
      
      <div className="mb-4">
        <h3 className="font-semibold mb-2">Preferred Airlines</h3>
        {airlineOptions.map(airline => (
          <div key={airline} className="flex items-center mb-1">
            <input
              type="checkbox"
              id={`airline-${airline}`}
              checked={preferences.preferred_airlines.includes(airline)}
              onChange={() => handleCheckboxChange('preferred_airlines', airline)}
              className="mr-2"
            />
            <label htmlFor={`airline-${airline}`}>{airline}</label>
          </div>
        ))}
      </div>
      
      <div className="mb-4">
        <h3 className="font-semibold mb-2">Must-have Hotel Amenities</h3>
        {amenityOptions.map(amenity => (
          <div key={amenity} className="flex items-center mb-1">
            <input
              type="checkbox"
              id={`amenity-${amenity}`}
              checked={preferences.hotel_amenities.includes(amenity)}
              onChange={() => handleCheckboxChange('hotel_amenities', amenity)}
              className="mr-2"
            />
            <label htmlFor={`amenity-${amenity}`}>{amenity}</label>
          </div>
        ))}
      </div>
      
      <div className="mb-4">
        <h3 className="font-semibold mb-2">Favorite Cuisines</h3>
        {cuisineOptions.map(cuisine => (
          <div key={cuisine} className="flex items-center mb-1">
            <input
              type="checkbox"
              id={`cuisine-${cuisine}`}
              checked={preferences.preferred_cuisines.includes(cuisine)}
              onChange={() => handleCheckboxChange('preferred_cuisines', cuisine)}
              className="mr-2"
            />
            <label htmlFor={`cuisine-${cuisine}`}>{cuisine}</label>
          </div>
        ))}
      </div>
      
      <div className="mb-4">
        <h3 className="font-semibold mb-2">Preferred Transportation</h3>
        {transportationOptions.map(option => (
          <div key={option} className="flex items-center mb-1">
            <input
              type="radio"
              id={`transport-${option}`}
              name="transportation"
              value={option}
              checked={preferences.transportation_preference === option}
              onChange={() => handleRadioChange('transportation_preference', option)}
              className="mr-2"
            />
            <label htmlFor={`transport-${option}`}>{option}</label>
          </div>
        ))}
      </div>
      
      <div className="mb-4">
        <h3 className="font-semibold mb-2">Budget Level</h3>
        {budgetOptions.map(option => (
          <div key={option} className="flex items-center mb-1">
            <input
              type="radio"
              id={`budget-${option}`}
              name="budget"
              value={option}
              checked={preferences.budget_level === option}
              onChange={() => handleRadioChange('budget_level', option)}
              className="mr-2"
            />
            <label htmlFor={`budget-${option}`} className="capitalize">{option}</label>
          </div>
        ))}
      </div>
      
      <button
        onClick={savePreferences}
        disabled={isSaving}
        className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded w-full"
      >
        {isSaving ? 'Saving...' : 'Save Preferences'}
      </button>
      
      {saveMessage && (
        <div className="mt-2 text-center text-sm text-green-600">
          {saveMessage}
        </div>
      )}
    </div>
  );
};

export default UserPreferences; 