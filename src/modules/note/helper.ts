const axios = require("axios");
import { intersection, uniq } from "lodash";
const ONEAUTH_API = process.env.ONEAUTH_API || "http://localhost:4010/api";
import { noteCollection, noteSchema } from "./model";
const { getCollection } = require("../../lib/dbutils");
import { nextval, resetval } from "../sequence/service";
import * as NotelinkHelper from "../notelink/helper";
import * as MetadataDefinitionHelper from "../metadata/definition/helper";
import * as ColorfilterHelper from "../colorfilter/helper";
import * as NotelinkAutoHelper from "../notelink/auto/helper";
import { isEmptyOrSpaces } from "../../lib/Utils";

const AI_API = process.env.AI_API || "http://localhost:5003/api";

export const updateNote = async (
  space: string,
  reload: string,
  data: any,
  userId?: string
) => {
  const model = getCollection(space, noteCollection, noteSchema);
  let response = null;
  const contentText = data.content.replace(/<[^>]*>/g, "");
  if (data._id) {
    response = await model.findByIdAndUpdate(
      data._id,
      {
        ...data,
        autoGeneratedSummary: isEmptyOrSpaces(data.summary)
          ? contentText.substring(0, 250)
          : "",
        contentText,
      },
      { new: true, upsert: true }
    );
  } else {
    response = await model.create({
      ...data,
      autoGeneratedSummary: isEmptyOrSpaces(data.summary)
        ? contentText.substring(0, 250)
        : "",
      reference: await nextval("noteId", undefined, space),
      contentText,
    });
  }

  let retrain = false;

  if (reload) {
    const updateCount = await nextval("note_update_count", "ai", space);
    console.log(updateCount);
    if (updateCount <= 20) {
      retrain = true;
    }
    if (updateCount > 20 && updateCount <= 100 && updateCount % 10 === 0) {
      retrain = true;
    }
    if (updateCount > 100 && updateCount <= 500 && updateCount % 25 === 0) {
      retrain = true;
    }
    if (updateCount > 500 && updateCount <= 1000 && updateCount % 50 === 0) {
      retrain = true;
    }
    if (updateCount > 1000 && updateCount % 100 === 0) {
      retrain = true;
    }

    if (updateCount % 200 === 0) {
      const notesCount = await model.find().estimatedDocumentCount();
      await resetval(notesCount + 2, "note_update_count", "ai", space);
    }
  }

  if (retrain) {
    console.log("---retraining");
    await _ai_train(space);
    await _ai_populate(space);
  }

  if (reload) {
    await _ai_populate_for_note(space, response.reference);
  }

  const notelinks = await NotelinkAutoHelper.getNotelinkAutoByNoteRef(
    space,
    response.reference
  );
  const noteResponse = await model.find({ reference: response.reference });
  let note = null;
  if (noteResponse.length > 0) {
    note = noteResponse[0];
  }

  return {
    notelinks,
    note,
  };
};

export const getNote = async (space: string) => {
  const model = getCollection(space, noteCollection, noteSchema);

  const res = await model.find();
  return res;
  // return res.map((item: any) => {
  //   return {
  //     ...item,
  //     summary: isEmptyOrSpaces(item.summary) ? item.autoGeneratedSummary : item.summary,
  //   };
  // });
};

export const getNoteDictionary = async (space: string) => {
  const model = getCollection(space, noteCollection, noteSchema);

  // return await model.find();
  const res = await _enrichWithGroupColor(space, await model.find());
  return res.map((item: any) => {
    return {
      _id: item._id,
      name: item.name,
      reference: item.reference,
      summary: isEmptyOrSpaces(item.summary)
        ? item.autoGeneratedSummary
        : item.summary,
      color: item.color,
      labels: item.labels,
    };
  });
};

const _enrichWithGroupColor = async (space: string, data: any[]) => {
  const filterGroupList = await ColorfilterHelper.getColorfilter(space);
  const response: any[] = [];
  for (let j = 0; j < data.length; j++) {
    const _record = data[j]._doc;
    let out = { ..._record };
    const _filterGroupList = filterGroupList
      .filter((filter: any) => !isEmptyOrSpaces(filter._doc.color))
      .reverse();

    for (let i = 0; i < _filterGroupList.length; i++) {
      const _filter = _filterGroupList[i]._doc;
      const outcome = await _processFilterPerRecord(space, _record, _filter);
      if (outcome) {
        out.color = _filter.color;
      }
    }
    response.push(out);
  }
  return response;
  // return await data.map(async (record: any) => {
  //   const _record = record._doc;
  //   let out = { ..._record };
  //   const _filterGroupList = filterGroupList
  //     .filter(
  //       (filter: any) =>
  //         !isEmptyOrSpaces(filter._doc.color)
  //     );

  //   for (let i = 0; i < _filterGroupList.length; i++) {
  //     const _filter = _filterGroupList[i]._doc;
  //     const outcome = await _processFilterPerRecord(space, _record, _filter);
  //     if (outcome) {
  //       out.color = _filter.color;
  //     }
  //   };
  //   // console.log(out);
  //   return out;
  // });
};

const _processFilterPerRecord = async (
  space: string,
  record: any,
  {
    text,
    textList,
    searchPref,
  }: {
    text: string;
    textList: string[];
    searchPref: any;
  }
) => {
  const metadataDefinitionList =
    await MetadataDefinitionHelper.getMetadataDefinition(space);
  const searchFields: string[] = [];

  if (searchPref) {
    Object.keys(searchPref).forEach((fieldName) => {
      if (searchPref[fieldName]) {
        searchFields.push(fieldName);
      }
    });
  }

  const outcome = false;
  const isValidText = !isEmptyOrSpaces(text);
  const textRegexp = new RegExp(text, "i");
  if (!isValidText && (searchFields.length !== 1 || textList.length === 0)) {
    return false;
  }
  if (
    isValidText &&
    (searchFields.length === 0 || searchFields.includes("content"))
  ) {
    if (record.content.match(textRegexp)) {
      return true;
    }
  }
  if (isValidText && searchFields.includes("name")) {
    if (record.name.match(textRegexp)) {
      return true;
    }
  }
  if (isValidText && searchFields.includes("labels")) {
    if (intersection(record.labels, text.split(" ")).length > 0) {
      return true;
    }
  }
  if (
    searchFields.length === 1 &&
    searchFields.includes("labels") &&
    textList.length > 0
  ) {
    if (intersection(record.labels, textList).length > 0) {
      return true;
    }
  }
  metadataDefinitionList.forEach((item: any) => {
    if (isValidText && searchFields.includes(item._id.toString())) {
      if (record[item._id.toString()].match(textRegexp)) {
        return true;
      }
    }

    if (
      searchFields.length === 1 &&
      searchFields.includes(item._id.toString()) &&
      textList.length > 0
    ) {
      if (intersection(record[item._id.toString()], textList).length > 0) {
        return true;
      }
    }
  });
  return false;
};

export const getRecentlyCreatedNote = async (space: string) => {
  const model = getCollection(space, noteCollection, noteSchema);

  const res = await model.find().sort({ $natural: -1 }).limit(1);
  if (res.length === 0) {
    return null;
  }
  return res[0];
};

export const getNoteByReference = async (space: string, reference: string) => {
  const model = getCollection(space, noteCollection, noteSchema);

  const res = await model.find({ reference });
  if (res.length === 0) {
    return null;
  }
  return res[0];
};

export const getNoteById = async (space: string, _id: string) => {
  const model = getCollection(space, noteCollection, noteSchema);

  const res = await model.find({ _id });
  if (res.length > 0) {
    return res[0];
  }
};

export const deleteNotesByFolderIdList = async (
  space: string,
  folderIdList: string[]
) => {
  const model = getCollection(space, noteCollection, noteSchema);

  return await model.deleteMany({ folderId: { $in: folderIdList } });
};

export const getNotesByFolderIdList = async (
  space: string,
  folderIdList: string[]
) => {
  const model = getCollection(space, noteCollection, noteSchema);

  return await model.find({ folderId: { $in: folderIdList } });
};

export const getNotesByReferenceList = async (
  space: string,
  refList: string[]
) => {
  const model = getCollection(space, noteCollection, noteSchema);

  return await model.find({ reference: { $in: refList } });
};

export const deleteNote = async (space: string, _id: string) => {
  const model = getCollection(space, noteCollection, noteSchema);

  await model.deleteMany({ _id });
  return { note: _id };
};

export const deleteNoteByReference = async (
  space: string,
  reference: string
) => {
  const model = getCollection(space, noteCollection, noteSchema);

  await model.deleteMany({ reference });
  await NotelinkHelper.deleteNotelinkByReference(space, reference);
  await NotelinkAutoHelper.deleteNotelinkByReference(space, reference);
  return { note: reference };
};

export const deleteNoteByReferenceList = async (
  space: string,
  payload: string[]
) => {
  console.log(payload);
  const model = getCollection(space, noteCollection, noteSchema);

  await model.deleteMany({ reference: { $in: payload } });
  await NotelinkHelper.deleteNotelinkByReferenceList(space, payload);
  await NotelinkAutoHelper.deleteNotelinkByReferenceList(space, payload);
  return { note: payload };
};

export const searchNoteByText = async (space: string, text: string) => {
  const model = getCollection(space, noteCollection, noteSchema);

  const res = await model.find({
    $text: { $search: `\"${text}\"`, $caseSensitive: false },
  });
  return res;
};

export const searchNote = async (
  space: string,
  text: string,
  textList: string[],
  searchPref: any
) => {
  const _text = text?.toLowerCase()?.replace(/ +/g, " ");

  const model = getCollection(space, noteCollection, noteSchema);
  const condition = await _getSearchCondition(
    space,
    _text,
    textList,
    searchPref
  );
  // console.log(condition);
  const res = await model.find({ $or: condition }).sort({ createdAt: -1 });
  return res.map((item: any) => {
    return {
      ...item._doc,
      summary: isEmptyOrSpaces(item.summary)
        ? item.autoGeneratedSummary
        : item.summary,
    };
  });
};

const _getSearchCondition = async (
  space: string,
  text: string,
  textList: string[],
  searchPref: any
) => {
  const metadataDefinitionList =
    await MetadataDefinitionHelper.getMetadataDefinition(space);
  const searchFields: string[] = [];

  if (searchPref) {
    Object.keys(searchPref).forEach((fieldName) => {
      if (searchPref[fieldName]) {
        searchFields.push(fieldName);
      }
    });
  }

  const condition: any[] = [];
  const isValidText = !isEmptyOrSpaces(text);
  if (
    isValidText &&
    (searchFields.length === 0 || searchFields.includes("content"))
  ) {
    // condition.push({
    //   $text: { $search: new RegExp(text, 'i'), $caseSensitive: false },
    // });
    condition.push({
      content: new RegExp(text, "i"),
    });
  }
  if (isValidText && searchFields.includes("name")) {
    condition.push({
      name: new RegExp(text, "i"),
    });
  }
  if (isValidText && searchFields.includes("labels")) {
    condition.push({
      labels: {
        $in: text.split(" "),
      },
    });
  }
  if (
    searchFields.length === 1 &&
    searchFields.includes("labels") &&
    textList.length > 0
  ) {
    condition.push({
      labels: {
        $in: textList,
      },
    });
  }
  metadataDefinitionList.forEach((item: any) => {
    if (isValidText && searchFields.includes(item._id.toString())) {
      condition.push({
        [item._id.toString()]: new RegExp(text, "i"),
      });
    }

    if (
      searchFields.length === 1 &&
      searchFields.includes(item._id.toString()) &&
      textList.length > 0
    ) {
      condition.push({
        [item._id.toString()]: {
          $in: textList,
        },
      });
    }
  });
  if (condition.length === 0) {
    return [{}];
  }
  return condition;
};

export const getNotesByMetadataValue = async (
  space: string,
  metadataId: string,
  payload: { value: string }
) => {
  const model = getCollection(space, noteCollection, noteSchema);
  let res = [];
  if (metadataId === "label") {
    res = await model
      .find({ labels: new RegExp(payload.value, "i") })
      .sort({ createdAt: -1 });
  } else {
    res = await model
      .find({ [metadataId]: new RegExp(payload.value, "i") })
      .sort({ createdAt: -1 });
  }
  return res.map((item: any) => {
    return {
      ...item._doc,
      summary: isEmptyOrSpaces(item.summary)
        ? item.autoGeneratedSummary
        : item.summary,
    };
  });
};

export const browseNotes = async (
  space: string,
  payload: { metadataId: string; metadataValue: string | string[] }
) => {
  console.log(payload);
  const model = getCollection(space, noteCollection, noteSchema);
  let res = [];
  if (payload.metadataId === "related") {
    const referenceNotes = await model.find({
      reference: { $in: payload.metadataValue },
    });
    let referenceKeywords: string[] = [];
    referenceNotes.forEach((item: any) => {
      referenceKeywords = referenceKeywords.concat(item.keywords);
    });
    referenceKeywords = uniq(referenceKeywords);
    res = await model
      .find({
        keywords: { $in: referenceKeywords },
      })
      .sort({ createdAt: -1 });
  } else {
    res = await model
      .find({
        [payload.metadataId]: new RegExp(payload.metadataValue.toString(), "i"),
      })
      .sort({ createdAt: -1 });
  }
  return res.map((item: any) => {
    return {
      ...item._doc,
      summary: isEmptyOrSpaces(item.summary)
        ? item.autoGeneratedSummary
        : item.summary,
    };
  });
};

export const _ai_train = async (space: string) => {
  console.log("AI_API=", AI_API);
  try {
    await axios.get(`${AI_API}/similarity/${space}/train`, {});
  } catch (err) {
    console.log(err);
  }
};

export const _ai_populate = async (space: string) => {
  try {
    await axios.get(`${AI_API}/similarity/${space}/populate`, {});
  } catch (err) {
    console.log(err);
  }
};

const _ai_populate_for_note = async (space: string, reference: string) => {
  try {
    await axios.get(`${AI_API}/similarity/${space}/populate/${reference}`, {});
  } catch (err) {
    console.log(err);
  }
};

export const getLabels = async (space: string) => {
  const model = getCollection(space, noteCollection, noteSchema);

  return await model.distinct("labels");
};

export const getKeywords = async (space: string) => {
  const model = getCollection(space, noteCollection, noteSchema);

  return await model.distinct("keywords");
};
