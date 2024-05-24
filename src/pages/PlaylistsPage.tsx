import React, { useEffect, useReducer, useState, useRef } from "react";
import { useSpotifyAuth } from "../context/SpotifyAuthContext";
import TrackComponent from "@/components/playlists/TrackComponent";
import ArtistComponent from "@/components/playlists/ArtistComponent";
import { Track, Playlist } from "../interfaces/PlaylistInterfaces";
import SideNav from "@/components/nav/SideNav";
import TopNav from "@/components/nav/TopNav";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { uniqBy } from "lodash";
import { Plus, Check, ArrowUp, ArrowDownUp } from "lucide-react";
import { truncateText } from "@/utils/textHelpers";
import CustomTooltip from "@/components/ui/CustomTooltip";
import { Input } from "@/components/ui/input";
import useErrorHandling from "@/hooks/useErrorHandling";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import SpotifyPreviewPlayer from "@/components/playlists/SpotifyPreviewPlayerComponent";

// Define action types
const actionTypes = {
  SET_PLAYLISTS: "SET_PLAYLISTS",
  TOGGLE_PLAYLIST_SELECTION: "TOGGLE_PLAYLIST_SELECTION",
  SET_TRACKS: "SET_TRACKS",
  ADD_TRACK_TO_PLAYLIST: "ADD_TRACK_TO_PLAYLIST",
  REMOVE_TRACK_FROM_PLAYLIST: "REMOVE_TRACK_FROM_PLAYLIST",
  DELETE_PLAYLIST: "DELETE_PLAYLIST",
};

// Define the initial state with the correct types
const initialState = {
  playlists: [],
  selectedPlaylists: [],
  playlistTracks: {} as Record<string, Track[]>,
};

interface State {
  playlists: Playlist[];
  selectedPlaylists: Playlist[];
  playlistTracks: Record<string, Track[]>;
}

interface Action {
  type: string;
  payload: any;
}

// Reducer function to manage state
const reducer = (state: State, action: Action) => {
  switch (action.type) {
    case actionTypes.SET_PLAYLISTS:
      return { ...state, playlists: action.payload as Playlist[] };
    case actionTypes.TOGGLE_PLAYLIST_SELECTION:
      const index = state.selectedPlaylists.findIndex(
        (p: Playlist) => p.id === action.payload.id
      );
      return {
        ...state,
        selectedPlaylists:
          index === -1
            ? [...state.selectedPlaylists, action.payload]
            : state.selectedPlaylists.filter(
                (p: Playlist) => p.id !== action.payload.id
              ),
      };
    case actionTypes.SET_TRACKS:
      return {
        ...state,
        playlistTracks: {
          ...state.playlistTracks,
          [action.payload.id]: action.payload.tracks as Track[],
        },
      };
    case actionTypes.ADD_TRACK_TO_PLAYLIST:
      return {
        ...state,
        playlistTracks: {
          ...state.playlistTracks,
          [action.payload.playlistId]: [
            ...(state.playlistTracks[action.payload.playlistId] || []),
            action.payload.track,
          ],
        },
      };
    case actionTypes.REMOVE_TRACK_FROM_PLAYLIST:
      const updatedTracks = state.playlistTracks[
        action.payload.playlistId
      ].filter((t) => t.id !== action.payload.trackId);
      return {
        ...state,
        playlistTracks: {
          ...state.playlistTracks,
          [action.payload.playlistId]: updatedTracks,
        },
      };
    case actionTypes.DELETE_PLAYLIST:
      return {
        ...state,
        playlists: state.playlists.filter((p) => p.id !== action.payload),
        selectedPlaylists: state.selectedPlaylists.filter(
          (p) => p.id !== action.payload
        ),
        playlistTracks: Object.keys(state.playlistTracks).reduce((acc, key) => {
          if (key !== action.payload) {
            acc[key] = state.playlistTracks[key];
          }
          return acc;
        }, {} as Record<string, Track[]>),
      };

    default:
      return state;
  }
};

const PlaylistsPage: React.FC = () => {
  const { token } = useSpotifyAuth();
  const [state, dispatch] = useReducer(reducer, initialState);
  const [searchQuery, setSearchQuery] = useState("");
  const [showErrorPopup, setShowErrorPopup] = useState(false);
  const [sortConfig, setSortConfig] = useState<{
    key: string;
    direction: string | null;
  }>({ key: "", direction: null });
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [columnWidths, setColumnWidths] = useState<{ song: number; artist: number; playlists: { [key: string]: number } }>({ song: 150, artist: 150, playlists: {} });

  const songRefs = useRef<(HTMLDivElement | null)[]>([]);
  const artistRefs = useRef<(HTMLDivElement | null)[]>([]);
  const playlistRefs = useRef<{ [key: string]: (HTMLDivElement | null)[] }>({});

  // Show error popup if the Spotify API is blocked
  useErrorHandling(setShowErrorPopup);

  useEffect(() => {
    const fetchPlaylists = async () => {
      if (!token) return;

      const userResponse = await fetch("https://api.spotify.com/v1/me", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const userData = await userResponse.json();

      const playlistsResponse = await fetch(
        `https://api.spotify.com/v1/users/${userData.id}/playlists`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const data = await playlistsResponse.json();

      // Filter to only include playlists where the current user is the owner
      const userOwnedPlaylists = data.items.filter(
        (playlist: { owner: { id: any } }) => playlist.owner.id === userData.id
      );

      dispatch({
        type: actionTypes.SET_PLAYLISTS,
        payload: userOwnedPlaylists,
      });
    };

    fetchPlaylists();
  }, [token]);

  useEffect(() => {
    state.selectedPlaylists.forEach((playlist) => {
      if (!state.playlistTracks[playlist.id]) {
        const fetchTracks = async () => {
          const response = await fetch(
            `https://api.spotify.com/v1/playlists/${playlist.id}/tracks`,
            { headers: { Authorization: `Bearer ${token}` } }
          );
          const data = await response.json();
          const tracks = data.items.map((item: any) => ({
            // Ensure type safety by replacing 'any' with a more specific type
            id: item.track.id,
            name: item.track.name,
            artists: item.track.artists.map((artist: any) => ({
              name: artist.name,
            })),
            albumImage: item.track.album.images[0]?.url || "",
            previewUrl: item.track.preview_url || "", // Add previewUrl
          }));
          dispatch({
            type: actionTypes.SET_TRACKS,
            payload: { id: playlist.id, tracks },
          });
        };
        fetchTracks();
      }
    });
  }, [state.selectedPlaylists, token]);

  useEffect(() => {
    // Measure column widths after tracks are loaded
    measureColumnWidths();
  }, [state.playlistTracks, state.selectedPlaylists]);

  const handlePlayPreview = (track: Track) => {
    if (currentTrack && currentTrack.id === track.id) {
      setIsPlaying(!isPlaying);
    } else {
      setCurrentTrack(track);
      setIsPlaying(true);
    }
  };

  const allTracks = uniqBy(
    state.selectedPlaylists.flatMap(
      (playlist) => state.playlistTracks[playlist.id] || []
    ),
    (track: Track) => track.id
  );

  const handlePlaylistToggle = (playlist: Playlist): void => {
    dispatch({
      type: actionTypes.TOGGLE_PLAYLIST_SELECTION,
      payload: playlist,
    });
  };

  const sortTracks = (
    tracks: Track[],
    key: keyof Track | "artist" | "playlist" | string,
    direction: "ascending" | "descending",
    playlistId?: string
  ) => {
    return tracks.sort((a, b) => {
      let aValue: string, bValue: string;

      if (playlistId) {
        const aInPlaylist = state.playlistTracks[playlistId]?.some(
          (t) => t.id === a.id
        );
        const bInPlaylist = state.playlistTracks[playlistId]?.some(
          (t) => t.id === b.id
        );

        if (aInPlaylist && !bInPlaylist) return -1;
        if (!aInPlaylist && bInPlaylist) return 1;
      }

      if (key === "artist") {
        aValue = a.artists[0]?.name.toLowerCase();
        bValue = b.artists[0]?.name.toLowerCase();
      } else if (key === "playlist") {
        const aPlaylist = state.selectedPlaylists.find((playlist) =>
          state.playlistTracks[playlist.id]?.some((t) => t.id === a.id)
        );
        const bPlaylist = state.selectedPlaylists.find((playlist) =>
          state.playlistTracks[playlist.id]?.some((t) => t.id === b.id)
        );
        aValue = aPlaylist?.name.toLowerCase() || "";
        bValue = bPlaylist?.name.toLowerCase() || "";
      } else if (key === "name") {
        aValue = a.name.toLowerCase();
        bValue = b.name.toLowerCase();
      } else {
        aValue = (a as any)[key]?.toString().toLowerCase();
        bValue = (b as any)[key]?.toString().toLowerCase();
      }

      if (aValue < bValue) {
        return direction === "ascending" ? -1 : 1;
      }
      if (aValue > bValue) {
        return direction === "ascending" ? 1 : -1;
      }
      return 0;
    });
  };

  const handleRenamePlaylist = async (playlistId: string, newName: string) => {
    await fetch(`https://api.spotify.com/v1/playlists/${playlistId}`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: newName }),
    });
    dispatch({
      type: actionTypes.SET_PLAYLISTS,
      payload: state.playlists.map((playlist) =>
        playlist.id === playlistId ? { ...playlist, name: newName } : playlist
      ),
    });
  };

  const handleDeletePlaylist = async (playlistId: string) => {
    await fetch(`https://api.spotify.com/v1/playlists/${playlistId}/followers`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    dispatch({
      type: actionTypes.DELETE_PLAYLIST,
      payload: playlistId,
    });
  };

  const filteredTracks = sortConfig.key
    ? sortTracks(
        [...allTracks],
        sortConfig.key as keyof Track | "artist" | "playlist",
        sortConfig.direction as "ascending" | "descending",
        state.selectedPlaylists.find((p) => p.id === sortConfig.key)?.id
      )
    : allTracks;

  const filteredAndSearchedTracks = filteredTracks.filter(
    (track) =>
      track.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      track.artists.some((artist) =>
        artist.name.toLowerCase().includes(searchQuery.toLowerCase())
      )
  );

  const addTrackToPlaylist = async (playlistId: string, trackUri: string) => {
    const response = await fetch(
      `https://api.spotify.com/v1/playlists/${playlistId}/tracks`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ uris: [trackUri] }),
      }
    );
    return response.json();
  };

  const moreThanXPlaylistsSelected = state.selectedPlaylists.length > 8;

  const removeTrackFromPlaylist = async (playlistId: string, trackUri: string) => {
    const response = await fetch(
      `https://api.spotify.com/v1/playlists/${playlistId}/tracks`,
      {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ tracks: [{ uri: trackUri }] }),
      }
    );
    return response.json();
  };

  const handleSort = (key: keyof Track | "artist" | "playlist" | string) => {
    let direction: "ascending" | "descending" = "ascending";
    if (sortConfig.key === key && sortConfig.direction === "ascending") {
      direction = "descending";
    }
    setSortConfig({ key, direction });
  };

  const measureColumnWidths = () => {
    const songWidths = songRefs.current.map(ref => ref?.offsetWidth || 0);
    const artistWidths = artistRefs.current.map(ref => ref?.offsetWidth || 0);

    setColumnWidths({
      song: 400,
      artist:150,
      playlists: state.selectedPlaylists.reduce((acc, playlist) => {
        acc[playlist.id] = playlist.name.length * 8 + 20; // Approximate width based on character length + padding
        return acc;
      }, {} as { [key: string]: number }),
    });
  };

  return (
    <div className="w-screen h-screen overflow-hidden bg-background grid auto-rows-12">
      {/* Error Popup Dialog */}
      {showErrorPopup && (
        <Dialog open={showErrorPopup} onOpenChange={setShowErrorPopup}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Spotify API blocked 😞</DialogTitle>
              <DialogDescription>
                It looks like a browser extension is blocking the Spotify API.
                Usually, at least for me, it's Privacy Badger blocking{" "}
                <span className="text-accent">api.spotify.com</span>. Unless you
                disable it the app can't really access any of you Spotify data.
              </DialogDescription>
            </DialogHeader>
          </DialogContent>
        </Dialog>
      )}
      <div className="w-full h-full row-span-1">
        <TopNav />
      </div>
      <div className="w-full h-full row-span-11 grid grid-cols-[auto,1fr] gap-3 p-3 pt-0 overflow-hidden">
        <SideNav
          playlists={state.playlists}
          selectedPlaylists={state.selectedPlaylists}
          onPlaylistToggle={handlePlaylistToggle}
          onDeletePlaylist={handleDeletePlaylist}
          onRenamePlaylist={handleRenamePlaylist}
        />

        <Card className="flex flex-col w-full h-full overflow-hidden">
          <CardHeader>
            <div>Edit Playlists</div>
            <div className="py-3 w-4/5 ">
              <Input
                type="text"
                placeholder="Search for a song or artist in your playlist"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-background"
              />
            </div>
          </CardHeader>
          <div className="w-full h-full flex flex-col overflow-auto">
            <div className="sticky top-0 z-10 bg-background">
              <div className="w-full flex">
                {/* Songs Column */}
                <div className="flex flex-col" style={{ width: `${columnWidths.song}px` }}>
                  <h2
                    className="font-bold h-14 cursor-pointer flex flex-row items-center justify-center"
                    onClick={() => handleSort("name")}
                  >
                    Song{" "}
                    {sortConfig.key === "name" ? (
                      sortConfig.direction === "ascending" ? (
                        <ArrowUp className="ml-1 w-4 h-4" />
                      ) : (
                        <ArrowDownUp className="ml-1 w-4 h-4" />
                      )
                    ) : (
                      <ArrowDownUp className="ml-1 w-4 h-4 text-muted-foreground" />
                    )}
                  </h2>
                </div>
                {/* Artists Column */}
                <div className="flex flex-col" style={{ width: `${columnWidths.artist}px` }}>
                  <h2
                    className="font-bold h-14 cursor-pointer flex flex-row items-center justify-center"
                    onClick={() => handleSort("artist")}
                  >
                    Artist{" "}
                    {sortConfig.key === "artist" ? (
                      sortConfig.direction === "ascending" ? (
                        <ArrowUp className="ml-1 w-4 h-4" />
                      ) : (
                        <ArrowDownUp className="ml-1 w-4 h-4" />
                      )
                    ) : (
                      <ArrowDownUp className="ml-1 w-4 h-4 text-muted-foreground" />
                    )}
                  </h2>
                </div>
                {/* Playlists Columns */}
                {state.selectedPlaylists.map((playlist: Playlist) => (
                  <div key={playlist.id} className="flex flex-col" style={{ width: `${columnWidths.playlists[playlist.id]}px` }}>
                    <h2
                      className="font-bold h-14 cursor-pointer flex flex-row items-center justify-center"
                      onClick={() => handleSort(playlist.id)}
                    >
                      <CustomTooltip
                        children={truncateText(playlist.name, 20)}
                        description={playlist.name}
                        time={300}
                      />{" "}
                      {sortConfig.key === playlist.id ? (
                        sortConfig.direction === "ascending" ? (
                          <ArrowUp className="ml-1 w-4 h-4" />
                        ) : (
                          <ArrowUp className="ml-1 w-4 h-4" />
                        )
                      ) : (
                        <ArrowUp className="ml-1 w-4 h-4 text-muted-foreground" />
                      )}
                    </h2>
                  </div>
                ))}
              </div>
            </div>
            <ScrollArea className="w-full h-full flex flex-col overflow-auto">
              <CardContent className="w-full flex p-3">
                {/* Songs Column */}
                <div className="flex flex-col" style={{ width: `${columnWidths.song}px` }}>
                  <div className="flex flex-col gap-6">
                    {filteredAndSearchedTracks.map((track: Track, index: number) => (
                      <div ref={el => {
                        if (el) songRefs.current[index] = el;
                      }} key={track.id}>
                        <TrackComponent
                          track={track}
                          moreThanXPlaylistsSelected={moreThanXPlaylistsSelected}
                          isPlaying={currentTrack?.id === track.id && isPlaying}
                          onPlayPreview={handlePlayPreview}
                        />
                      </div>
                    ))}
                  </div>
                </div>
                {/* Artists Column */}
                <div className="flex flex-col" style={{ width: `${columnWidths.artist}px` }}>
                  <div className="flex flex-col gap-6">
                    {filteredAndSearchedTracks.map((track: Track, index: number) => (
                      <div ref={el => {
                        if (el) artistRefs.current[index] = el;
                      }} key={track.id}>
                        <ArtistComponent
                          track={track}
                          moreThanXPlaylistsSelected={moreThanXPlaylistsSelected}
                        />
                      </div>
                    ))}
                  </div>
                </div>
                {/* Playlists Columns */}
                {state.selectedPlaylists.map((playlist: Playlist) => (
                  <div key={playlist.id} className="flex flex-col" style={{ width: `${columnWidths.playlists[playlist.id]}px` }}>
                    <div className="flex flex-col gap-6">
                      {filteredAndSearchedTracks.map((track: Track, index: number) => {
                        const isInPlaylist = state.playlistTracks[
                          playlist.id
                        ]?.some((pTrack) => pTrack.id === track.id);
                        const handleToggleTrack = () => {
                          if (isInPlaylist) {
                            removeTrackFromPlaylist(
                              playlist.id,
                              `spotify:track:${track.id}`
                            ).then(() => {
                              dispatch({
                                type: actionTypes.REMOVE_TRACK_FROM_PLAYLIST,
                                payload: {
                                  playlistId: playlist.id,
                                  trackId: track.id,
                                },
                              });
                            });
                          } else {
                            addTrackToPlaylist(
                              playlist.id,
                              `spotify:track:${track.id}`
                            ).then(() => {
                              dispatch({
                                type: actionTypes.ADD_TRACK_TO_PLAYLIST,
                                payload: {
                                  playlistId: playlist.id,
                                  track: track,
                                },
                              });
                            });
                          }
                        };
                        return (
                          <div ref={el => {
                            if (el) {
                              if (!playlistRefs.current[playlist.id]) playlistRefs.current[playlist.id] = [];
                              playlistRefs.current[playlist.id][index] = el;
                            }
                          }} key={track.id} className="p-1 h-14 flex justify-center">
                            <button onClick={handleToggleTrack} className="">
                              {isInPlaylist ? (
                                <Check className="text-primary hover:text-primary/50" />
                              ) : (
                                <Plus className="text-accent hover:text-accent/50" />
                              )}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </CardContent>
            </ScrollArea>
          </div>
        </Card>
      </div>
      {/* Render the SpotifyPreviewPlayer if there is a currentTrack */}
      {currentTrack && (
        <SpotifyPreviewPlayer
          track={currentTrack}
          isPlaying={isPlaying}
          onPlayPreview={handlePlayPreview}
        />
      )}
    </div>
  );
};

export default PlaylistsPage;