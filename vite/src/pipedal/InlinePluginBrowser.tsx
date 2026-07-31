// Copyright (c) 2026 Thomas Rapolani
// SPDX-License-Identifier: MIT

import { useEffect, useMemo, useState } from 'react';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SearchIcon from '@mui/icons-material/Search';
import StarIcon from '@mui/icons-material/Star';
import ButtonBase from '@mui/material/ButtonBase';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { PluginType, UiPlugin } from './Lv2Plugin';
import {
    getPluginCategoryTags,
    getUiPluginCategory,
    orderedPluginCategories,
    PluginCategory,
} from './PluginCategories';
import PluginIcon from './PluginIcon';
import { FavoritesList, PiPedalModelFactory } from './PiPedalModel';
import SearchFilter from './SearchFilter';

interface InlinePluginBrowserProps {
    onSelect: (pluginUri: string) => void;
}

function categoryIconType(categoryId: string): PluginType {
    switch (categoryId) {
        case 'amp': return PluginType.AmplifierPlugin;
        case 'cab': return PluginType.SimulatorPlugin;
        case 'distortion': return PluginType.DistortionPlugin;
        case 'dynamics': return PluginType.CompressorPlugin;
        case 'eq': return PluginType.EQPlugin;
        case 'modulation': return PluginType.ChorusPlugin;
        case 'delay': return PluginType.DelayPlugin;
        case 'reverb': return PluginType.ReverbPlugin;
        case 'pitch': return PluginType.PitchPlugin;
        case 'filter': return PluginType.FilterPlugin;
        case 'spatial': return PluginType.SpatialPlugin;
        case 'utility': return PluginType.UtilityPlugin;
        default: return PluginType.Plugin;
    }
}

export default function InlinePluginBrowser(props: InlinePluginBrowserProps) {
    const model = PiPedalModelFactory.getInstance();
    const [plugins, setPlugins] = useState<UiPlugin[]>(model.ui_plugins.get());
    const [favorites, setFavorites] = useState<FavoritesList>(model.favorites.get());
    const [categoryId, setCategoryId] = useState<string | null>(null);
    const [manufacturer, setManufacturer] = useState<string | null>(null);
    const [search, setSearch] = useState('');

    const selectCategory = (id: string | null) => { setCategoryId(id); setManufacturer(null); };

    useEffect(() => {
        const onPluginsChanged = (value: UiPlugin[]) => setPlugins(value);
        const onFavoritesChanged = (value: FavoritesList) => setFavorites(value);
        model.ui_plugins.addOnChangedHandler(onPluginsChanged);
        model.favorites.addOnChangedHandler(onFavoritesChanged);
        return () => {
            model.ui_plugins.removeOnChangedHandler(onPluginsChanged);
            model.favorites.removeOnChangedHandler(onFavoritesChanged);
        };
    }, [model]);

    const categories = useMemo(() => {
        const counts = new Map<string, number>();
        for (const plugin of plugins) {
            const id = getUiPluginCategory(plugin).id;
            counts.set(id, (counts.get(id) ?? 0) + 1);
        }
        return orderedPluginCategories
            .filter((category) => (counts.get(category.id) ?? 0) !== 0)
            .map((category) => ({ category, count: counts.get(category.id) ?? 0 }));
    }, [plugins]);

    const visiblePlugins = useMemo(() => {
        const searchText = search.trim();
        const searchFilter = new SearchFilter(searchText);
        const scored: Array<{ plugin: UiPlugin; score: number }> = [];
        for (const plugin of plugins) {
            const category = getUiPluginCategory(plugin);
            if (!searchText && categoryId && category.id !== categoryId) {
                continue;
            }
            if (!searchText && manufacturer && (plugin.author_name || 'Other') !== manufacturer) {
                continue;
            }
            const tags = getPluginCategoryTags(plugin);
            let score = searchFilter.score(
                plugin.name,
                plugin.author_name,
                plugin.plugin_display_type,
                tags.join(' '),
            );
            if (score === 0) {
                continue;
            }
            if (favorites[plugin.uri]) {
                score += 32768;
            }
            scored.push({ plugin, score });
        }
        scored.sort((left, right) => {
            if (left.score !== right.score) {
                return right.score - left.score;
            }
            const categoryOrder =
                getUiPluginCategory(left.plugin).rank -
                getUiPluginCategory(right.plugin).rank;
            if (categoryOrder !== 0) {
                return categoryOrder;
            }
            return left.plugin.name.localeCompare(right.plugin.name);
        });
        return scored.map((entry) => entry.plugin);
    }, [categoryId, manufacturer, favorites, plugins, search]);

    // Manufacturers (by author) within the selected category, as a sub-level.
    const manufacturers = useMemo(() => {
        if (!categoryId) return [] as Array<{ name: string; count: number }>;
        const counts = new Map<string, number>();
        for (const plugin of plugins) {
            if (getUiPluginCategory(plugin).id !== categoryId) continue;
            const name = plugin.author_name || 'Other';
            counts.set(name, (counts.get(name) ?? 0) + 1);
        }
        return Array.from(counts.entries())
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => a.name.localeCompare(b.name));
    }, [categoryId, plugins]);

    const selectedCategory: PluginCategory | undefined =
        categoryId === null
            ? undefined
            : orderedPluginCategories.find((category) => category.id === categoryId);
    const searching = search.trim().length !== 0;
    // If a category has only one manufacturer, skip the sub-level.
    const showManufacturerList = !searching && selectedCategory !== undefined
        && manufacturer === null && manufacturers.length > 1;
    const showPluginList = searching
        || (selectedCategory !== undefined && !showManufacturerList);

    return (
        <div style={{
            height: '100%',
            overflowY: 'auto',
            padding: '12px clamp(12px, 3vw, 32px) 28px',
        }}>
            <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                marginBottom: 14,
                maxWidth: 760,
            }}>
                {selectedCategory && !searching && (
                    <IconButton
                        aria-label="Back"
                        onClick={() => {
                            if (manufacturer !== null) { setManufacturer(null); }
                            else { selectCategory(null); }
                        }}
                        size="small"
                    >
                        <ArrowBackIcon />
                    </IconButton>
                )}
                <TextField
                    fullWidth
                    size="small"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search plugins"
                    slotProps={{
                        input: {
                            startAdornment: (
                                <InputAdornment position="start">
                                    <SearchIcon fontSize="small" />
                                </InputAdornment>
                            ),
                        },
                    }}
                />
            </div>

            {!showPluginList ? (
                showManufacturerList ? (
                    <div>
                        <Typography sx={{ fontSize: '1rem', fontWeight: 650, marginBottom: 1 }}>
                            {selectedCategory?.label}
                        </Typography>
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                            gap: 8,
                            maxWidth: 1040,
                        }}>
                            {manufacturers.map(({ name, count }) => (
                                <ButtonBase
                                    key={name}
                                    onClick={() => setManufacturer(name)}
                                    aria-label={`${name}, ${count} plugins`}
                                    sx={{
                                        minHeight: 60,
                                        border: '1px solid',
                                        borderColor: 'divider',
                                        borderRadius: '6px',
                                        px: 1.5,
                                        justifyContent: 'space-between',
                                        textAlign: 'left',
                                    }}
                                >
                                    <Typography noWrap sx={{ fontSize: '0.9rem', fontWeight: 600 }}>
                                        {name}
                                    </Typography>
                                    <Typography color="text.secondary" sx={{ fontSize: '0.75rem', marginLeft: 1 }}>
                                        {count}
                                    </Typography>
                                </ButtonBase>
                            ))}
                        </div>
                    </div>
                ) : (
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
                    gap: 8,
                    maxWidth: 1040,
                }}>
                    {categories.map(({ category, count }) => (
                        <ButtonBase
                            key={category.id}
                            onClick={() => selectCategory(category.id)}
                            aria-label={`${category.label}, ${count} plugins`}
                            sx={{
                                minHeight: 76,
                                border: '1px solid',
                                borderColor: 'divider',
                                borderLeft: `4px solid ${category.color}`,
                                borderRadius: '6px',
                                px: 1.5,
                                py: 1,
                                justifyContent: 'flex-start',
                                textAlign: 'left',
                            }}
                        >
                            <PluginIcon
                                pluginType={categoryIconType(category.id)}
                                size={28}
                                opacity={1}
                                color={category.color}
                            />
                            <div style={{ minWidth: 0, marginLeft: 12 }}>
                                <Typography noWrap sx={{ fontSize: '0.95rem', fontWeight: 650 }}>
                                    {category.label}
                                </Typography>
                                <Typography color="text.secondary" sx={{ fontSize: '0.75rem' }}>
                                    {count}
                                </Typography>
                            </div>
                        </ButtonBase>
                    ))}
                </div>
                )
            ) : (
                <div>
                    <div style={{
                        display: 'flex',
                        alignItems: 'baseline',
                        gap: 10,
                        marginBottom: 8,
                    }}>
                        <Typography sx={{ fontSize: '1rem', fontWeight: 650 }}>
                            {searching
                                ? 'Search'
                                : manufacturer
                                    ? `${selectedCategory?.label} · ${manufacturer}`
                                    : selectedCategory?.label}
                        </Typography>
                        <Typography color="text.secondary" sx={{ fontSize: '0.75rem' }}>
                            {visiblePlugins.length}
                        </Typography>
                    </div>
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(270px, 1fr))',
                        gap: 6,
                        maxWidth: 1180,
                    }}>
                        {visiblePlugins.map((plugin) => {
                            const category = getUiPluginCategory(plugin);
                            const pluginType = plugin.uri === 'http://two-play.com/plugins/toob-nam'
                                ? PluginType.NamPlugin
                                : plugin.plugin_type;
                            return (
                                <ButtonBase
                                    key={plugin.uri}
                                    onClick={() => props.onSelect(plugin.uri)}
                                    sx={{
                                        minHeight: 70,
                                        border: '1px solid',
                                        borderColor: 'divider',
                                        borderRadius: '6px',
                                        px: 1.25,
                                        py: 1,
                                        justifyContent: 'flex-start',
                                        textAlign: 'left',
                                        overflow: 'hidden',
                                    }}
                                >
                                    <PluginIcon
                                        pluginType={pluginType}
                                        size={26}
                                        opacity={1}
                                        color={category.color}
                                    />
                                    <div style={{ minWidth: 0, marginLeft: 12, flex: '1 1 auto' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                            <Typography noWrap sx={{ fontSize: '0.9rem', fontWeight: 600 }}>
                                                {plugin.name}
                                            </Typography>
                                            {favorites[plugin.uri] && (
                                                <StarIcon sx={{ color: '#c58b18', fontSize: 15, flex: '0 0 auto' }} />
                                            )}
                                        </div>
                                        <Typography noWrap color="text.secondary" sx={{ fontSize: '0.72rem' }}>
                                            {plugin.author_name}
                                        </Typography>
                                        <div style={{
                                            display: 'flex',
                                            gap: 4,
                                            marginTop: 5,
                                            overflow: 'hidden',
                                        }}>
                                            {getPluginCategoryTags(plugin).map((tag, index) => (
                                                <Chip
                                                    key={tag}
                                                    label={tag}
                                                    size="small"
                                                    sx={{
                                                        height: 18,
                                                        borderRadius: '4px',
                                                        fontSize: '0.65rem',
                                                        color: index === 0 ? category.color : undefined,
                                                        '& .MuiChip-label': { px: 0.75 },
                                                    }}
                                                />
                                            ))}
                                        </div>
                                    </div>
                                </ButtonBase>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}
